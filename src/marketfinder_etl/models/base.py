"""Base models for MarketFinder ETL pipeline."""

from typing import Any, Dict, Optional
from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel as PydanticBaseModel, Field, ConfigDict


class BaseModel(PydanticBaseModel):
    """Base model with common configuration."""
    
    model_config = ConfigDict(
        # Enable validation on assignment
        validate_assignment=True,
        # Use enum values instead of enum objects
        use_enum_values=True,
        # Allow extra fields for flexibility
        extra="forbid",
        # Validate default values
        validate_default=True,
        # Enable JSON schema generation
        json_schema_extra={
            "examples": []
        }
    )


class TimestampedModel(BaseModel):
    """Model with automatic timestamp tracking."""
    
    id: UUID = Field(default_factory=uuid4, description="Unique identifier")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    
    def update_timestamp(self) -> None:
        """Update the updated_at timestamp to current time."""
        self.updated_at = datetime.utcnow()


class MetadataModel(TimestampedModel):
    """Model with metadata tracking."""
    
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    
    def add_metadata(self, key: str, value: Any) -> None:
        """Add metadata entry."""
        self.metadata[key] = value
        self.update_timestamp()
    
    def get_metadata(self, key: str, default: Any = None) -> Any:
        """Get metadata value."""
        return self.metadata.get(key, default)