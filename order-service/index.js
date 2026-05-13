const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');
const db = require('./database');

// Load proto
const PROTO_PATH = path.join(__dirname, '../proto/order.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const orderProto = grpc.loadPackageDefinition(packageDef).order;

// Kafka setup
const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['localhost:9092'],
  retry: { retries: 3 }
});
const producer = kafka.producer();

let kafkaConnected = false;

const connectKafka = async () => {
  try {
    await producer.connect();
    kafkaConnected = true;
    console.log('✅ Kafka producer connected');
  } catch (err) {
    console.log('⚠️ Kafka not available, continuing without it');
  }
};

const publishEvent = async (topic, message) => {
  if (!kafkaConnected) return;
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }]
    });
  } catch (err) {
    console.log('Kafka publish failed:', err.message);
  }
};

// gRPC service implementation
const orderService = {
  CreateOrder: async (call, callback) => {
    try {
      const { customer_name, customer_email, items } = call.request;
      const id = uuidv4();
      const created_at = new Date().toISOString();
      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      db.prepare(`
        INSERT INTO orders (id, customer_name, customer_email, total, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(id, customer_name, customer_email, total, created_at);

      const insertItem = db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        insertItem.run(uuidv4(), id, item.product_id, item.product_name, item.quantity, item.price);
      }

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
      const fullOrder = { ...order, items: orderItems };

      // Publish Kafka event
      await publishEvent('order-created', {
        orderId: id,
        customerName: customer_name,
        customerEmail: customer_email,
        total,
        items,
        createdAt: created_at
      });

      callback(null, fullOrder);
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  GetOrder: (call, callback) => {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(call.request.id);
      if (!order) {
        return callback({ code: grpc.status.NOT_FOUND, message: 'Order not found' });
      }
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(call.request.id);
      callback(null, { ...order, items });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  GetAllOrders: (call, callback) => {
    try {
      const orders = db.prepare('SELECT * FROM orders').all();
      const fullOrders = orders.map(order => {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
        return { ...order, items };
      });
      callback(null, { orders: fullOrders });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  UpdateOrderStatus: async (call, callback) => {
    try {
      const { id, status } = call.request;
      const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      if (!existing) {
        return callback({ code: grpc.status.NOT_FOUND, message: 'Order not found' });
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);

      // Publish Kafka event
      await publishEvent('order-status-updated', {
        orderId: id,
        newStatus: status,
        customerEmail: order.customer_email
      });

      callback(null, { ...order, items });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  }
};

// Start server
const server = new grpc.Server();
server.addService(orderProto.OrderService.service, orderService);

const PORT = '50052';
server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), async (err, port) => {
  if (err) {
    console.error('Failed to start Order Service:', err);
    return;
  }
  console.log(`✅ Order Service running on port ${port}`);
  await connectKafka();
});