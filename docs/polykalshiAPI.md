
# Could you provide links to or content from these additional documentation sections
--Original Request--
<!-- 1. Kalshi API Complete Specification

Can you provide or direct me to:

- Request Parameters: Query filters, pagination parameters
- Response Schema: Full market object structure
- Authentication: Header requirements, API key usage
- Rate Limits: Requests per minute/hour limits
- Pagination: Cursor vs offset-based, page size limits

2. Authentication Documentation

For both platforms:

- Polymarket: How to obtain and use CLOB API credentials
- Kalshi: API key generation and authentication headers
- Rate Limiting: Specific limits for market data endpoints

3. Market Data Structure Comparison

To build the standardized schema effectively:

- Polymarket: Complete market object fields and nested structures
- Kalshi: Equivalent market object fields and their mappings
- Category Taxonomies: How each platform categorizes markets

4. Additional Endpoints Potentially Needed

For complete pipeline implementation:

- Market Details: Individual market data with full context
- Market Events/Series: Grouping related markets
- Historical Data: Price history endpoints
- Market Status: Active/closed/resolved states

Specific Documentation Requests:

1. Kalshi Complete Markets API: Full specification for /v2/markets endpoint
2. Authentication Guides: Both platform credential setup and usage
3. Rate Limiting Policies: To design appropriate batch processing
4. Market Object Schemas: Complete field definitions for standardization -->

--Answer to Request--
I can provide you with the available documentation content from the search results, though some specific details you're looking for may require accessing the official documentation directly.

## Kalshi API Complete Specification

### Authentication

Kalshi uses API key authentication with tokens that expire every 30 minutes[^1][^2]. The authentication process requires:

- **API Key Generation**: Create an API key in your account settings after creating a Kalshi account[^1][^2]
- **Token Management**: Your code needs to handle periodic re-login to maintain active sessions due to the 30-minute expiration[^1][^2]
- **Environment Variables**: Store credentials securely using environment variables rather than hardcoding them[^1]

**Authentication Headers**: The search results reference cookie-based authentication in the Python client examples[^3]:

```python
# Configure API key authorization: cookie
configuration.api_key['cookie'] = 'YOUR_API_KEY'
```


### API Endpoints Structure

Kalshi's REST API follows standard principles with logical endpoint structure[^2]:

- `/markets` - Market data and listings
- `/events` - Event information (collections of related markets)
- `/orders` - Order management
- `/portfolio` - Account and position data

**Base URLs**[^4]:

- **Demo Environment**: `https://demo-api.kalshi.co/trade-api/v2/`
- **Production Environment**: `https://trading-api.kalshi.com/trade-api/v2/`


### Request Parameters and Filtering

The markets endpoint supports filtering with parameters like[^2]:

```
GET /markets?status=open&event_id=FRSEP23
```


### Pagination

Kalshi uses cursor-based pagination to avoid data drift[^2]:

```
GET /markets?cursor=abc123&limit=50
```


### Rate Limits

Kalshi implements rate limiting to protect services[^1]. The search results mention that "Kalshi caps the number of requests to prevent abuse" but don't specify exact limits. Best practices include[^1]:

- Using exponential backoff when hitting limits
- Queueing requests to spread them over time
- Caching frequently accessed data to reduce API calls


## Polymarket Authentication Documentation

### CLOB API Credentials

Polymarket uses a two-level authentication system[^5]:

**L2 API Key Authentication** requires these headers[^5]:

- `POLY_ADDRESS`: Polygon address
- `POLY_SIGNATURE`: HMAC signature for request
- `POLY_TIMESTAMP`: Current UNIX timestamp
- `POLY_API_KEY`: Polymarket API key
- `POLY_PASSPHRASE`: Polymarket API key passphrase


### API Credential Generation

The credentials are generated deterministically[^5]:

- `key`: UUID identifying the credentials
- `secret`: Secret string used to generate HMACs (not sent with requests)
- `passphrase`: Secret string sent with each request

**Generation Process** (from search results)[^6]:

```python
from py_clob_client.client import ClobClient

host = "https://clob.polymarket.com"
key = "YOUR_PRIVATE_KEY"  # From Polymarket account export
chain_id = 137  # Polygon Mainnet

client = ClobClient(host, key=key, chain_id=chain_id)
api_creds = client.create_or_derive_api_creds()
```


## Market Data Structure Comparison

### Kalshi Market Object

The search results show Kalshi market objects include[^4]:

- Market ID (UUID format)
- Market history and statistics
- Order book data with bid/ask information
- Settlement information
- Trading positions


### Polymarket Market Object

Polymarket markets include these fields[^7][^8]:

- `id`: Market identifier
- `slug`: Market slug
- `condition_id`: CTF condition ID
- `question_id`: CTF question ID
- `tokens`: Binary token pair
- `question`: Market question
- `category`: Market category
- `active`: Boolean for market status
- `closed`: Boolean for market closure
- `end_date_iso`: Market end date
- `minimum_order_size`: Minimum order size
- `minimum_tick_size`: Minimum tick size

**Sample Polymarket Response Structure**[^7]:

```json
{
  "id": 123,
  "slug": "<string>",
  "archived": true,
  "active": true,
  "closed": true,
  "liquidity": 123,
  "volume": 123,
  "start_date": "2023-11-07T05:31:56Z",
  "end_date": "2023-11-07T05:31:56Z"
}
```


## Additional Endpoints and Capabilities

### Kalshi Specific Endpoints

From the API specification[^9]:

- `/cached/markets` - Cached market listings (slightly lagged data)
- `/cached/markets/{market_id}` - Individual market data (cached)
- Market history endpoints for backtesting[^10]
- WebSocket endpoints for real-time data[^10]


### Polymarket Specific Endpoints

- **Gamma Markets API**: `https://gamma-api.polymarket.com/markets`[^7]
- **CLOB API**: `https://clob.polymarket.com`[^11]
- Market filtering by liquidity, volume, dates, and tags[^7]


### Market Categories and Features

**Kalshi Categories**[^10]: Politics, Sports, Culture, Crypto, Climate, Economics, Tech \& Science, Health, World

**Kalshi Features**[^10]:

- Historical spreads for backtesting
- Low-latency broadcasts for real-time updates
- Economic projections using proprietary forecasting tools


## Documentation Access Recommendations

For complete specifications, you should access:

1. **Kalshi Official Documentation**: The search results reference official API documentation at kalshi.com/api[^10]
2. **Polymarket Developer Docs**: Available at docs.polymarket.com for complete CLOB and Gamma API specifications
3. **GitHub Repositories**:
    - KalshiPythonClient for implementation examples[^9][^3]
    - Community-built tools and examples[^12]

The search results provide a solid foundation, but for production implementation, you'll want to access the official documentation directly for the most current rate limits, complete schema definitions, and any recent API changes.

<div style="text-align: center">⁂</div>

[^1]: https://zuplo.com/blog/2025/04/02/kalshi-api

[^2]: https://dev.to/zuplo/kalshi-api-the-complete-developers-guide-1fo4

[^3]: https://github.com/AndrewNolte/KalshiPythonClient/blob/main/docs/AccountApi.md

[^4]: https://pkg.go.dev/github.com/ammario/kalshi

[^5]: https://docs.polymarket.com/developers/CLOB/authentication

[^6]: https://jeremywhittaker.com/index.php/2024/08/28/generating-api-keys-for-polymarket-com/

[^7]: https://docs.polymarket.com/developers/gamma-markets-api/get-markets

[^8]: https://docs.polymarket.com/developers/CLOB/markets/get-markets

[^9]: https://github.com/AndrewNolte/KalshiPythonClient/blob/main/swagger.json

[^10]: https://kalshi.com/api

[^11]: https://docs.polymarket.com/developers/CLOB/clob-FAQ

[^12]: https://github.com/carllman13/Kalshi_Trading/blob/main/KalshiTradingV2.ipynb

[^13]: https://github.com/AndrewNolte/KalshiPythonClient/blob/main/docs/AuthApi.md

[^14]: https://help-center.atlasbeta.so/getatlas-fk5muzvm1f/articles/107206-creating-your-kalshi-account

[^15]: https://www.cftc.gov/sites/default/files/filings/orgrules/23/07/rules0714234041.pdf

[^16]: https://help.kalshi.com/kalshi-api

[^17]: https://trading-api.readme.io/reference/getmarkets-1

[^18]: https://github.com/Polymarket/py-clob-client

[^19]: https://www.reddit.com/r/PolymarketHQ/comments/1hs5muu/token_id_and_passphrase_to_connect_to_polymarket/

[^20]: https://ariverwhale.substack.com/p/stepping-up-the-market-search-process

[^21]: https://trading-api.readme.io/reference/getevents

[^22]: https://kalshi.com/market-data

[^23]: https://www.reddit.com/r/Kalshi/comments/1gwjlee/api_documentation/

[^24]: https://yandex.ru/dev/market/partner-api/doc/en/concepts/pagination

[^25]: https://www.gosquared.com/developer/content/rate-limits.html

[^26]: https://betterprogramming.pub/understanding-the-offset-and-cursor-pagination-8ddc54d10d98?gi=ba71004d350a

[^27]: https://docs.polymarket.com

[^28]: https://mirror.xyz/polymarket.eth/TOHA3ir5R76bO1vjTrKQclS9k8Dygma53OIzHztJSjk

[^29]: https://kalshi.com/blog/article/no-shutdown-this-year-after-all

[^30]: https://docs.polymarket.com/developers/CLOB/trades/trades-overview

[^31]: https://docs.polymarket.com/developers/neg-risk/overview

[^32]: https://polymarketanalytics.com/polymarket-vs-kalshi

[^33]: https://docs.rs/kalshi/latest/x86_64-apple-darwin/kalshi/struct.MarketPosition.html

[^34]: https://appfigures.com/resources/insights/20241101?f=1

[^35]: https://plisio.net/blog/polymarket-how-does-a-decentralized-prediction-market-work

[^36]: https://blog.thirdweb.com/the-complete-guide-to-prediction-markets-2024-how-polymarket-revolutionized-forecasting/

[^37]: https://docs.rs/kalshi/latest/kalshi/struct.Kalshi.html

