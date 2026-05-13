const express = require('express');
const bodyParser = require('body-parser');
const { ApolloServer } = require('apollo-server-express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const app = express();
app.use((req, res, next) => {
  if (req.path === '/graphql') return next();
  bodyParser.json()(req, res, next);
});

// ─── gRPC Clients ───────────────────────────────────────────────
const loadProto = (filename) => {
  const packageDef = protoLoader.loadSync(path.join(__dirname, '../proto', filename), {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
  });
  return grpc.loadPackageDefinition(packageDef);
};

const productProto = loadProto('product.proto').product;
const orderProto = loadProto('order.proto').order;
const notificationProto = loadProto('notification.proto').notification;

const productClient = new productProto.ProductService('localhost:50051', grpc.credentials.createInsecure());
const orderClient = new orderProto.OrderService('localhost:50052', grpc.credentials.createInsecure());
const notificationClient = new notificationProto.NotificationService('localhost:50053', grpc.credentials.createInsecure());

// ─── Helper: promisify gRPC calls ───────────────────────────────
const call = (client, method, request = {}) => new Promise((resolve, reject) => {
  client[method](request, (err, response) => {
    if (err) reject(err);
    else resolve(response);
  });
});

// ─── REST Routes: Products ──────────────────────────────────────
app.get('/products', async (req, res) => {
  try {
    const result = await call(productClient, 'GetAllProducts');
    res.json(result.products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/products/:id', async (req, res) => {
  try {
    const result = await call(productClient, 'GetProduct', { id: req.params.id });
    res.json(result);
  } catch (err) { res.status(404).json({ error: err.message }); }
});

app.post('/products', async (req, res) => {
  try {
    const result = await call(productClient, 'CreateProduct', req.body);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/products/:id', async (req, res) => {
  try {
    const result = await call(productClient, 'UpdateProduct', { id: req.params.id, ...req.body });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const result = await call(productClient, 'DeleteProduct', { id: req.params.id });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REST Routes: Orders ────────────────────────────────────────
app.get('/orders', async (req, res) => {
  try {
    const result = await call(orderClient, 'GetAllOrders');
    res.json(result.orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const result = await call(orderClient, 'GetOrder', { id: req.params.id });
    res.json(result);
  } catch (err) { res.status(404).json({ error: err.message }); }
});

app.post('/orders', async (req, res) => {
  try {
    const result = await call(orderClient, 'CreateOrder', req.body);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/orders/:id/status', async (req, res) => {
  try {
    const result = await call(orderClient, 'UpdateOrderStatus', { id: req.params.id, status: req.body.status });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REST Routes: Notifications ─────────────────────────────────
app.get('/notifications', async (req, res) => {
  try {
    const result = await call(notificationClient, 'GetAllNotifications');
    res.json(result.notifications);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/notifications', async (req, res) => {
  try {
    const result = await call(notificationClient, 'CreateNotification', req.body);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GraphQL Schema ─────────────────────────────────────────────
const typeDefs = `
  type Product {
    id: String
    name: String
    series: String
    character: String
    price: Float
    stock: Int
    image_url: String
  }

  type OrderItem {
    product_id: String
    product_name: String
    quantity: Int
    price: Float
  }

  type Order {
    id: String
    customer_name: String
    customer_email: String
    total: Float
    status: String
    created_at: String
    items: [OrderItem]
  }

  type Notification {
    id: String
    type: String
    message: String
    data: String
    created_at: String
  }

  type DeleteResponse {
    success: Boolean
    message: String
  }

  type Query {
    products: [Product]
    product(id: String!): Product
    orders: [Order]
    order(id: String!): Order
    notifications: [Notification]
  }

  type Mutation {
    createProduct(name: String!, series: String!, character: String!, price: Float!, stock: Int!, image_url: String): Product
    deleteProduct(id: String!): DeleteResponse
    createOrder(customer_name: String!, customer_email: String!, items: [OrderItemInput!]!): Order
    updateOrderStatus(id: String!, status: String!): Order
  }

  input OrderItemInput {
    product_id: String!
    product_name: String!
    quantity: Int!
    price: Float!
  }
`;

const resolvers = {
  Query: {
    products: () => call(productClient, 'GetAllProducts').then(r => r.products),
    product: (_, { id }) => call(productClient, 'GetProduct', { id }),
    orders: () => call(orderClient, 'GetAllOrders').then(r => r.orders),
    order: (_, { id }) => call(orderClient, 'GetOrder', { id }),
    notifications: () => call(notificationClient, 'GetAllNotifications').then(r => r.notifications),
  },
  Mutation: {
    createProduct: (_, args) => call(productClient, 'CreateProduct', args),
    deleteProduct: (_, { id }) => call(productClient, 'DeleteProduct', { id }),
    createOrder: (_, args) => call(orderClient, 'CreateOrder', args),
    updateOrderStatus: (_, { id, status }) => call(orderClient, 'UpdateOrderStatus', { id, status }),
  }
};

// ─── Start Server ───────────────────────────────────────────────
const start = async () => {
  const apolloServer = new ApolloServer({ typeDefs, resolvers });
  await apolloServer.start();
  apolloServer.applyMiddleware({ app, path: '/graphql' });

  app.listen(3000, () => {
    console.log('✅ API Gateway running on port 3000');
    console.log('📡 REST API: http://localhost:3000');
    console.log('🔍 GraphQL: http://localhost:3000/graphql');
  });
};

start();