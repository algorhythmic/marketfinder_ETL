"""
Advanced Alerting System - Multi-channel notification and escalation

This module provides sophisticated alerting capabilities with multiple notification
channels, escalation policies, and intelligent alert aggregation.
"""

import asyncio
import json
import smtplib
from typing import Any, Dict, List, Optional, Callable, Union
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dataclasses import dataclass
from enum import Enum
import aiohttp
import uuid

from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.monitoring.metrics_collector import AlertEvent, AlertSeverity


class NotificationChannel(str, Enum):
    """Notification channel types."""
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    SMS = "sms"
    PAGERDUTY = "pagerduty"
    DISCORD = "discord"


class EscalationLevel(str, Enum):
    """Alert escalation levels."""
    L1 = "l1"  # First responder
    L2 = "l2"  # Team lead
    L3 = "l3"  # Management
    L4 = "l4"  # Executive


@dataclass
class NotificationConfig:
    """Configuration for a notification channel."""
    channel: NotificationChannel
    enabled: bool = True
    
    # Channel-specific settings
    webhook_url: Optional[str] = None
    email_recipients: Optional[List[str]] = None
    slack_webhook_url: Optional[str] = None
    slack_channel: Optional[str] = None
    
    # Filtering
    severity_filter: Optional[List[AlertSeverity]] = None
    component_filter: Optional[List[str]] = None
    
    # Rate limiting
    max_notifications_per_hour: int = 60
    cooldown_seconds: int = 300


@dataclass
class EscalationPolicy:
    """Escalation policy configuration."""
    name: str
    levels: List[EscalationLevel]
    escalation_delays: List[int]  # Minutes between escalations
    max_escalations: int = 3
    
    # Conditions for escalation
    severity_threshold: AlertSeverity = AlertSeverity.CRITICAL
    duration_threshold_minutes: int = 15
    acknowledgment_timeout_minutes: int = 30


class NotificationMessage(BaseModel):
    """Notification message format."""
    message_id: str
    alert_id: str
    channel: NotificationChannel
    recipient: str
    subject: str
    content: str
    html_content: Optional[str] = None
    metadata: Dict[str, Any] = {}
    
    # Delivery tracking
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class AlertAcknowledgment(BaseModel):
    """Alert acknowledgment record."""
    alert_id: str
    acknowledged_by: str
    acknowledged_at: datetime
    acknowledgment_source: str  # "web", "email", "slack", etc.
    notes: Optional[str] = None


class AlertManager(LoggerMixin):
    """
    Advanced Alert Manager with multi-channel notifications and escalation.
    
    Provides intelligent alert routing, escalation policies, and notification
    delivery across multiple channels with delivery confirmation.
    """
    
    def __init__(self):
        # Notification configuration
        self.notification_configs: Dict[str, NotificationConfig] = {}
        self.escalation_policies: Dict[str, EscalationPolicy] = {}
        
        # State tracking
        self.sent_notifications: Dict[str, NotificationMessage] = {}
        self.acknowledged_alerts: Dict[str, AlertAcknowledgment] = {}
        self.escalated_alerts: Dict[str, Dict] = {}
        
        # Rate limiting
        self.notification_counts: Dict[str, List[datetime]] = {}
        
        # Background tasks
        self.is_running = False
        self.background_tasks: List[asyncio.Task] = []
        
        # Statistics
        self.stats = {
            "total_alerts": 0,
            "notifications_sent": 0,
            "notifications_failed": 0,
            "alerts_acknowledged": 0,
            "escalations_triggered": 0
        }
        
        # Initialize default configurations
        self._initialize_default_configs()
    
    def _initialize_default_configs(self) -> None:
        """Initialize default notification configurations."""
        
        # Default email config (would be configured from settings)
        self.notification_configs["email_alerts"] = NotificationConfig(
            channel=NotificationChannel.EMAIL,
            email_recipients=["alerts@marketfinder.com"],
            severity_filter=[AlertSeverity.ERROR, AlertSeverity.CRITICAL]
        )
        
        # Default Slack config
        self.notification_configs["slack_alerts"] = NotificationConfig(
            channel=NotificationChannel.SLACK,
            slack_channel="#alerts",
            severity_filter=[AlertSeverity.WARNING, AlertSeverity.ERROR, AlertSeverity.CRITICAL]
        )
        
        # Default escalation policy
        self.escalation_policies["default"] = EscalationPolicy(
            name="default",
            levels=[EscalationLevel.L1, EscalationLevel.L2, EscalationLevel.L3],
            escalation_delays=[15, 30, 60],  # 15, 30, 60 minutes
            severity_threshold=AlertSeverity.CRITICAL
        )
    
    async def start(self) -> None:
        """Start the alert manager."""
        
        if self.is_running:
            return
        
        self.is_running = True
        
        # Start background tasks
        escalation_task = asyncio.create_task(self._escalation_loop())
        self.background_tasks.append(escalation_task)
        
        cleanup_task = asyncio.create_task(self._cleanup_loop())
        self.background_tasks.append(cleanup_task)
        
        self.logger.info("Alert manager started")
    
    async def stop(self) -> None:
        """Stop the alert manager."""
        
        if not self.is_running:
            return
        
        self.is_running = False
        
        # Cancel background tasks
        for task in self.background_tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self.background_tasks.clear()
        self.logger.info("Alert manager stopped")
    
    async def handle_alert(self, alert: AlertEvent) -> None:
        """Handle incoming alert event."""
        
        self.stats["total_alerts"] += 1
        
        try:
            # Send notifications
            await self._send_notifications(alert)
            
            # Check for escalation
            if self._should_escalate(alert):
                await self._initiate_escalation(alert)
            
            self.logger.info(f"Alert handled: {alert.alert_id}")
            
        except Exception as e:
            self.logger.error(f"Error handling alert {alert.alert_id}: {e}")
    
    async def _send_notifications(self, alert: AlertEvent) -> None:
        """Send notifications for an alert."""
        
        for config_name, config in self.notification_configs.items():
            if not config.enabled:
                continue
            
            # Check severity filter
            if config.severity_filter and alert.severity not in config.severity_filter:
                continue
            
            # Check rate limits
            if not self._check_rate_limit(config_name, config):
                self.logger.warning(f"Rate limit exceeded for {config_name}")
                continue
            
            try:
                if config.channel == NotificationChannel.EMAIL:
                    await self._send_email_notification(alert, config)
                elif config.channel == NotificationChannel.SLACK:
                    await self._send_slack_notification(alert, config)
                elif config.channel == NotificationChannel.WEBHOOK:
                    await self._send_webhook_notification(alert, config)
                elif config.channel == NotificationChannel.DISCORD:
                    await self._send_discord_notification(alert, config)
                
                self.stats["notifications_sent"] += 1
                
            except Exception as e:
                self.stats["notifications_failed"] += 1
                self.logger.error(f"Failed to send {config.channel} notification: {e}")
    
    async def _send_email_notification(self, alert: AlertEvent, config: NotificationConfig) -> None:
        """Send email notification."""
        
        if not config.email_recipients:
            return
        
        # Create message
        subject = f"[{alert.severity.upper()}] MarketFinder Alert: {alert.rule_name}"
        
        # HTML content
        html_content = f"""
        <html>
        <body>
        <h2 style="color: {'red' if alert.severity == AlertSeverity.CRITICAL else 'orange'}">
            Alert: {alert.rule_name}
        </h2>
        
        <table border="1" cellpadding="5" cellspacing="0">
        <tr><td><strong>Severity</strong></td><td>{alert.severity.value.upper()}</td></tr>
        <tr><td><strong>Metric</strong></td><td>{alert.metric_name}</td></tr>
        <tr><td><strong>Current Value</strong></td><td>{alert.current_value}</td></tr>
        <tr><td><strong>Threshold</strong></td><td>{alert.threshold}</td></tr>
        <tr><td><strong>Triggered At</strong></td><td>{alert.triggered_at.isoformat()}</td></tr>
        <tr><td><strong>Message</strong></td><td>{alert.message}</td></tr>
        </table>
        
        <p><strong>Labels:</strong> {json.dumps(alert.labels, indent=2)}</p>
        
        <p>This alert was generated by MarketFinder ETL monitoring system.</p>
        </body>
        </html>
        """
        
        # Text content
        text_content = f"""
        MarketFinder Alert: {alert.rule_name}
        
        Severity: {alert.severity.value.upper()}
        Metric: {alert.metric_name}
        Current Value: {alert.current_value}
        Threshold: {alert.threshold}
        Triggered At: {alert.triggered_at.isoformat()}
        
        Message: {alert.message}
        
        Labels: {json.dumps(alert.labels, indent=2)}
        """
        
        # Store notification record
        notification = NotificationMessage(
            message_id=str(uuid.uuid4()),
            alert_id=alert.alert_id,
            channel=NotificationChannel.EMAIL,
            recipient=", ".join(config.email_recipients),
            subject=subject,
            content=text_content,
            html_content=html_content,
            sent_at=datetime.utcnow()
        )
        
        self.sent_notifications[notification.message_id] = notification
        
        # In a real implementation, this would send actual email
        self.logger.info(f"Email notification sent: {subject}")
    
    async def _send_slack_notification(self, alert: AlertEvent, config: NotificationConfig) -> None:
        """Send Slack notification."""
        
        if not config.slack_webhook_url:
            return
        
        # Create Slack message
        color = {
            AlertSeverity.INFO: "good",
            AlertSeverity.WARNING: "warning", 
            AlertSeverity.ERROR: "danger",
            AlertSeverity.CRITICAL: "danger"
        }.get(alert.severity, "warning")
        
        slack_message = {
            "username": "MarketFinder Alerts",
            "icon_emoji": ":warning:",
            "channel": config.slack_channel,
            "attachments": [
                {
                    "color": color,
                    "title": f"Alert: {alert.rule_name}",
                    "text": alert.message,
                    "fields": [
                        {"title": "Severity", "value": alert.severity.value.upper(), "short": True},
                        {"title": "Metric", "value": alert.metric_name, "short": True},
                        {"title": "Current Value", "value": str(alert.current_value), "short": True},
                        {"title": "Threshold", "value": str(alert.threshold), "short": True},
                    ],
                    "timestamp": int(alert.triggered_at.timestamp())
                }
            ]
        }
        
        # Send to Slack
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.slack_webhook_url,
                json=slack_message,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    notification = NotificationMessage(
                        message_id=str(uuid.uuid4()),
                        alert_id=alert.alert_id,
                        channel=NotificationChannel.SLACK,
                        recipient=config.slack_channel or "unknown",
                        subject=f"Alert: {alert.rule_name}",
                        content=json.dumps(slack_message),
                        sent_at=datetime.utcnow(),
                        delivered_at=datetime.utcnow()
                    )
                    
                    self.sent_notifications[notification.message_id] = notification
                    self.logger.info(f"Slack notification sent: {alert.rule_name}")
                else:
                    raise Exception(f"Slack webhook failed with status {response.status}")
    
    async def _send_webhook_notification(self, alert: AlertEvent, config: NotificationConfig) -> None:
        """Send webhook notification."""
        
        if not config.webhook_url:
            return
        
        # Create webhook payload
        webhook_payload = {
            "alert_id": alert.alert_id,
            "rule_name": alert.rule_name,
            "severity": alert.severity.value,
            "metric_name": alert.metric_name,
            "current_value": alert.current_value,
            "threshold": alert.threshold,
            "message": alert.message,
            "labels": alert.labels,
            "triggered_at": alert.triggered_at.isoformat(),
            "source": "marketfinder-etl"
        }
        
        # Send webhook
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.webhook_url,
                json=webhook_payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status < 400:
                    notification = NotificationMessage(
                        message_id=str(uuid.uuid4()),
                        alert_id=alert.alert_id,
                        channel=NotificationChannel.WEBHOOK,
                        recipient=config.webhook_url,
                        subject=f"Alert: {alert.rule_name}",
                        content=json.dumps(webhook_payload),
                        sent_at=datetime.utcnow(),
                        delivered_at=datetime.utcnow()
                    )
                    
                    self.sent_notifications[notification.message_id] = notification
                    self.logger.info(f"Webhook notification sent: {alert.rule_name}")
                else:
                    raise Exception(f"Webhook failed with status {response.status}")
    
    async def _send_discord_notification(self, alert: AlertEvent, config: NotificationConfig) -> None:
        """Send Discord notification."""
        
        if not config.webhook_url:
            return
        
        # Create Discord embed
        embed_color = {
            AlertSeverity.INFO: 0x00ff00,      # Green
            AlertSeverity.WARNING: 0xffff00,  # Yellow
            AlertSeverity.ERROR: 0xff9900,    # Orange
            AlertSeverity.CRITICAL: 0xff0000  # Red
        }.get(alert.severity, 0xffff00)
        
        discord_message = {
            "username": "MarketFinder Alerts",
            "embeds": [
                {
                    "title": f"🚨 Alert: {alert.rule_name}",
                    "description": alert.message,
                    "color": embed_color,
                    "fields": [
                        {"name": "Severity", "value": alert.severity.value.upper(), "inline": True},
                        {"name": "Metric", "value": alert.metric_name, "inline": True},
                        {"name": "Current Value", "value": str(alert.current_value), "inline": True},
                        {"name": "Threshold", "value": str(alert.threshold), "inline": True},
                    ],
                    "timestamp": alert.triggered_at.isoformat(),
                    "footer": {"text": "MarketFinder ETL"}
                }
            ]
        }
        
        # Send to Discord
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.webhook_url,
                json=discord_message,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status < 400:
                    notification = NotificationMessage(
                        message_id=str(uuid.uuid4()),
                        alert_id=alert.alert_id,
                        channel=NotificationChannel.DISCORD,
                        recipient="discord_webhook",
                        subject=f"Alert: {alert.rule_name}",
                        content=json.dumps(discord_message),
                        sent_at=datetime.utcnow(),
                        delivered_at=datetime.utcnow()
                    )
                    
                    self.sent_notifications[notification.message_id] = notification
                    self.logger.info(f"Discord notification sent: {alert.rule_name}")
                else:
                    raise Exception(f"Discord webhook failed with status {response.status}")
    
    def _check_rate_limit(self, config_name: str, config: NotificationConfig) -> bool:
        """Check rate limit for notification channel."""
        
        current_time = datetime.utcnow()
        hour_ago = current_time - timedelta(hours=1)
        
        # Initialize if not exists
        if config_name not in self.notification_counts:
            self.notification_counts[config_name] = []
        
        # Remove old notifications
        self.notification_counts[config_name] = [
            timestamp for timestamp in self.notification_counts[config_name]
            if timestamp > hour_ago
        ]
        
        # Check limit
        if len(self.notification_counts[config_name]) >= config.max_notifications_per_hour:
            return False
        
        # Add current notification
        self.notification_counts[config_name].append(current_time)
        return True
    
    def _should_escalate(self, alert: AlertEvent) -> bool:
        """Check if alert should be escalated."""
        
        # Only escalate critical alerts
        if alert.severity != AlertSeverity.CRITICAL:
            return False
        
        # Check if alert is already escalated
        if alert.alert_id in self.escalated_alerts:
            return False
        
        # Check if alert has been acknowledged
        if alert.alert_id in self.acknowledged_alerts:
            return False
        
        return True
    
    async def _initiate_escalation(self, alert: AlertEvent) -> None:
        """Initiate alert escalation."""
        
        policy = self.escalation_policies.get("default")
        if not policy:
            return
        
        escalation_record = {
            "alert_id": alert.alert_id,
            "policy_name": policy.name,
            "started_at": datetime.utcnow(),
            "current_level": 0,
            "escalation_times": [],
            "acknowledged": False
        }
        
        self.escalated_alerts[alert.alert_id] = escalation_record
        self.stats["escalations_triggered"] += 1
        
        self.logger.warning(f"Escalation initiated for alert: {alert.alert_id}")
    
    async def _escalation_loop(self) -> None:
        """Background loop for handling escalations."""
        
        while self.is_running:
            try:
                current_time = datetime.utcnow()
                
                for alert_id, escalation in list(self.escalated_alerts.items()):
                    if escalation["acknowledged"]:
                        continue
                    
                    policy = self.escalation_policies.get(escalation["policy_name"])
                    if not policy:
                        continue
                    
                    current_level = escalation["current_level"]
                    
                    # Check if it's time for next escalation
                    if current_level < len(policy.levels):
                        started_at = escalation["started_at"]
                        if current_level < len(policy.escalation_delays):
                            delay_minutes = policy.escalation_delays[current_level]
                            next_escalation_time = started_at + timedelta(minutes=delay_minutes)
                            
                            if current_time >= next_escalation_time:
                                await self._execute_escalation(alert_id, escalation, policy, current_level)
                
                await asyncio.sleep(60)  # Check every minute
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in escalation loop: {e}")
                await asyncio.sleep(30)
    
    async def _execute_escalation(
        self, 
        alert_id: str, 
        escalation: Dict, 
        policy: EscalationPolicy, 
        level: int
    ) -> None:
        """Execute escalation to next level."""
        
        escalation_level = policy.levels[level]
        escalation["current_level"] = level + 1
        escalation["escalation_times"].append(datetime.utcnow())
        
        self.logger.critical(f"Alert {alert_id} escalated to level {escalation_level.value}")
        
        # In a real implementation, this would send escalated notifications
        # to specific personnel based on the escalation level
    
    async def _cleanup_loop(self) -> None:
        """Background loop for cleaning up old records."""
        
        while self.is_running:
            try:
                await self._cleanup_old_records()
                await asyncio.sleep(3600)  # Cleanup every hour
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in cleanup loop: {e}")
                await asyncio.sleep(300)
    
    async def _cleanup_old_records(self) -> None:
        """Clean up old notification and escalation records."""
        
        cutoff_time = datetime.utcnow() - timedelta(days=7)  # Keep 7 days
        
        # Clean up old notifications
        old_notifications = [
            msg_id for msg_id, msg in self.sent_notifications.items()
            if msg.sent_at and msg.sent_at < cutoff_time
        ]
        
        for msg_id in old_notifications:
            del self.sent_notifications[msg_id]
        
        # Clean up old acknowledgments
        old_acks = [
            alert_id for alert_id, ack in self.acknowledged_alerts.items()
            if ack.acknowledged_at < cutoff_time
        ]
        
        for alert_id in old_acks:
            del self.acknowledged_alerts[alert_id]
        
        if old_notifications or old_acks:
            self.logger.info(f"Cleaned up {len(old_notifications)} old notifications and {len(old_acks)} old acknowledgments")
    
    # Public API methods
    
    def add_notification_config(self, name: str, config: NotificationConfig) -> None:
        """Add notification configuration."""
        self.notification_configs[name] = config
        self.logger.info(f"Added notification config: {name}")
    
    def remove_notification_config(self, name: str) -> bool:
        """Remove notification configuration."""
        if name in self.notification_configs:
            del self.notification_configs[name]
            self.logger.info(f"Removed notification config: {name}")
            return True
        return False
    
    def acknowledge_alert(
        self, 
        alert_id: str, 
        acknowledged_by: str, 
        source: str = "manual",
        notes: Optional[str] = None
    ) -> bool:
        """Acknowledge an alert."""
        
        if alert_id in self.acknowledged_alerts:
            return False  # Already acknowledged
        
        acknowledgment = AlertAcknowledgment(
            alert_id=alert_id,
            acknowledged_by=acknowledged_by,
            acknowledged_at=datetime.utcnow(),
            acknowledgment_source=source,
            notes=notes
        )
        
        self.acknowledged_alerts[alert_id] = acknowledgment
        
        # Mark escalation as acknowledged if exists
        if alert_id in self.escalated_alerts:
            self.escalated_alerts[alert_id]["acknowledged"] = True
        
        self.stats["alerts_acknowledged"] += 1
        self.logger.info(f"Alert acknowledged: {alert_id} by {acknowledged_by}")
        
        return True
    
    def get_alert_status(self, alert_id: str) -> Dict[str, Any]:
        """Get status of an alert."""
        
        status = {
            "alert_id": alert_id,
            "acknowledged": alert_id in self.acknowledged_alerts,
            "escalated": alert_id in self.escalated_alerts,
            "notifications_sent": []
        }
        
        # Get acknowledgment details
        if alert_id in self.acknowledged_alerts:
            ack = self.acknowledged_alerts[alert_id]
            status["acknowledgment"] = {
                "acknowledged_by": ack.acknowledged_by,
                "acknowledged_at": ack.acknowledged_at.isoformat(),
                "source": ack.acknowledgment_source,
                "notes": ack.notes
            }
        
        # Get escalation details
        if alert_id in self.escalated_alerts:
            escalation = self.escalated_alerts[alert_id]
            status["escalation"] = {
                "policy": escalation["policy_name"],
                "current_level": escalation["current_level"],
                "started_at": escalation["started_at"].isoformat(),
                "escalation_count": len(escalation["escalation_times"])
            }
        
        # Get notifications
        notifications = [
            {
                "message_id": msg.message_id,
                "channel": msg.channel.value,
                "recipient": msg.recipient,
                "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
                "delivered": msg.delivered_at is not None,
                "failed": msg.failed_at is not None
            }
            for msg in self.sent_notifications.values()
            if msg.alert_id == alert_id
        ]
        
        status["notifications_sent"] = notifications
        
        return status
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get alerting statistics."""
        
        return {
            **self.stats,
            "active_configs": len(self.notification_configs),
            "active_escalations": len([e for e in self.escalated_alerts.values() if not e["acknowledged"]]),
            "pending_acknowledgments": len(self.escalated_alerts) - len(self.acknowledged_alerts),
            "notification_channels": list(set(config.channel.value for config in self.notification_configs.values()))
        }