## Data fields Javier needs

### Clothing items

| Field | Type | Notes |
|---|---|---|
| `type` | `TEXT NOT NULL` | e.g. "t-shirt", "jeans", "sneakers" |
| `color` | `TEXT` | primary color |
| `pattern` | `TEXT` | e.g. "solid", "striped", "floral" |
| `material` | `TEXT` | e.g. "cotton", "denim", "leather" |
| `season` | `TEXT` | e.g. "spring", "summer", "fall", "winter", "all-season" |
| `formality` | `TEXT` | e.g. "casual", "business-casual", "formal" |
| `image_url` | `TEXT` | path/URL to the stored photo |
| `embedding` | `VECTOR(768)` | requires the `pgvector` extension |
