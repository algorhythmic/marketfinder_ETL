## Project Overview
Create a detailed technical specification for a Market Finder platform with the following core capabilities:
- Real-time data acquisition from multiple prediction market APIs
- Semantic matching of equivalent markets across platforms
- Live dashboard with price comparisons and arbitrage opportunities
- Secure user authentication and API key management
- Scalable architecture using Convex backend-as-a-service

## Technical Requirements

### 1. Data Architecture & Acquisition
Design a comprehensive data acquisition and modeling system:
- **Real-time Data Fetching**: Specify the architecture for continuously scraping/fetching data from prediction market APIs (Polymarket, Kalshi, PredictIt, Manifold, etc.)
- **Database Schema**: Design a relational database schema optimized for storing market data, including tables for markets, prices, platforms, users, and semantic mappings
- **Data Normalization**: Create a system for standardizing market data across different platform formats
- **Rate Limiting & Error Handling**: Implement robust systems for managing API rate limits and handling failures gracefully

### 2. User Interface & Experience
Design a modern, responsive dashboard using the specified component libraries:
- **Sidebar Navigation**: Implement using https://www.neobrutalism.dev/docs/sidebar for platform navigation, filters, and user settings
- **Data Table**: Create a comprehensive market comparison table using https://www.neobrutalism.dev/docs/data-table with features like:
  - Real-time price updates
  - Sortable columns (price, volume, platform, probability)
  - Expandable rows for detailed market information
  - Batch selection for portfolio tracking
- **Real-time Updates**: Implement live data streaming to update prices and market status without page refreshes
- **Responsive Design**: Ensure the platform works seamlessly across desktop, tablet, and mobile devices

### 3. Authentication & Security
Implement a secure, scalable authentication system:
- **User Registration/Login**: Multi-factor authentication with email verification
- **API Key Management**: Secure storage and encryption of user API keys for various prediction market platforms
- **Payment Integration**: Subscription-based access with secure payment processing
- **Data Security**: Implement proper encryption for sensitive user data and API credentials
- **Role-based Access**: Different permission levels for free, premium, and enterprise users

### 4. Convex Integration
Leverage Convex's backend-as-a-service capabilities:
- **Convex Functions**: Design server functions for data fetching, processing, and API endpoints
- **Real-time Subscriptions**: Use Convex's reactive database for live updates
- **Authentication Integration**: Implement Convex Auth for user management
- **File Storage**: Use Convex file storage for user avatars and exported data
- **Cron Jobs**: Set up scheduled functions for regular data updates and maintenance

### 5. Advanced Features
Include sophisticated market analysis capabilities:
- **Semantic Matching Algorithm**: Develop an AI-powered system to identify equivalent markets across platforms using natural language processing
- **Arbitrage Detection**: Automatically identify price discrepancies between equivalent markets
- **Portfolio Tracking**: Allow users to track their positions across multiple platforms
- **Alerts System**: Real-time notifications for price movements and arbitrage opportunities
- **Analytics Dashboard**: Historical data analysis and trend visualization

## Deliverables Required

1. **Technical Architecture Document**: Complete system architecture including data flow diagrams, database ERD, and API specifications
2. **Database Schema**: Detailed relational database design with tables, relationships, and indexes
3. **API Documentation**: Comprehensive documentation for both internal APIs and external integrations
4. **Component Specifications**: Detailed specifications for the sidebar and data table components with styling guidelines
5. **Security Framework**: Complete security implementation plan including authentication flows and data protection measures
6. **Deployment Strategy**: Step-by-step deployment plan using Convex Chef and production scaling considerations
7. **Development Timeline**: Phased development approach with milestones and deliverables

## Technical Constraints
- Must use Convex as the primary backend service
- Utilize Convex Chef for rapid development and deployment
- Implement the specified Neobrutalism UI components for sidebar and data table
- Ensure real-time data updates with minimal latency
- Design for horizontal scalability to handle thousands of concurrent users
- Maintain 99.9% uptime with proper error handling and fallback mechanisms

Provide a comprehensive, production-ready specification that a development team could use to build this platform from scratch. Include code examples, architectural diagrams (described in text), and specific implementation details for each component.