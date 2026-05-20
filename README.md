# 🎌 Anime Figurine Shop — Microservices Architecture

A full microservices application for an anime figurine e-commerce shop.

## Architecture

```plaintext
Client (Postman)
     │
     ▼
API Gateway (Port 3000)
REST & GraphQL & HTTP/1.1
     │
     ├──── gRPC ────▶ Product Service (Port 50051) ──▶ SQLite3 (products.db)
     │                        │
     │                        │ Kafka: order-created
     │                        ▼
     ├──── gRPC ────▶ Order Service (Port 50052) ──▶ SQLite3 (orders.db)
     │                        │
     │                        │ Kafka: order-status-updated
     │                        ▼
     └──── gRPC ────▶ Notification Service (Port 50053) ──▶ RxDB
                              ▲
                         Kafka Broker (Port 9092)
```
## Technologies
- **REST + GraphQL** — API Gateway (Express + Apollo Server)
- **gRPC** — Internal communication between services
- **Kafka** — Async event messaging between services
- **SQLite3** — Embedded SQL database (Product & Order services)
- **RxDB** — Embedded NoSQL database (Notification service)

## Services

| Service | Port | Database |
|---------|------|----------|
| API Gateway | 3000 | — |
| Product Service | 50051 | SQLite3 |
| Order Service | 50052 | SQLite3 |
| Notification Service | 50053 | RxDB |

## Kafka Events

| Event | Producer | Consumer |
|-------|----------|----------|
| `order-created` | Order Service | Notification Service |
| `order-status-updated` | Order Service | Notification Service |

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /products | Get all products |
| GET | /products/:id | Get product by ID |
| POST | /products | Create product |
| PUT | /products/:id | Update product |
| DELETE | /products/:id | Delete product |
| GET | /orders | Get all orders |
| GET | /orders/:id | Get order by ID |
| POST | /orders | Create order |
| PUT | /orders/:id/status | Update order status |
| GET | /notifications | Get all notifications |
| POST | /notifications | Create notification |

## GraphQL Endpoint
`POST http://localhost:3000/graphql`

### Queries
```graphql
{ products { id name series price stock } }
{ orders { id customer_name total status } }
{ notifications { id type message created_at } }
```

### Mutations
```graphql
mutation { createProduct(name: "...", series: "...", character: "...", price: 0.0, stock: 0) { id name } }
mutation { createOrder(customer_name: "...", customer_email: "...", items: [...]) { id total status } }
```

## How to Run

### 1. Start Kafka
```bash
docker-compose up -d
```

### 2. Start all services (each in a separate terminal)
```bash
cd product-service && node index.js
cd order-service && node index.js
cd notification-service && node index.js
cd api-gateway && node index.js
```

### 3. Test
- REST: `http://localhost:3000/products`
- GraphQL: `http://localhost:3000/graphql`

## Postman Collection
[View Collection](https://arijabdaoui-2169832.postman.co/workspace/Arij's-Workspace~89aae6d4-40a5-455b-85c4-ddbfcbefbcb9/collection/52365366-37b451db-9d26-4a2c-92c1-82ff212f7016)