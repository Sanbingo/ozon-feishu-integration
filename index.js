// index.js

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { FEISHU_WEBHOOK_URL } = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// 使用 body-parser 解析 JSON 请求体
app.use(bodyParser.json());

// 程序版本和名称（可以根据实际情况设置）
const appVersion = "1.0.0";
const appName = "OzonEventReceiver";

// 通用的错误响应函数
async function sendErrorResponse(res, errorCode, errorMessage, details = null, statusCode = 500) {
    const errorResponse = {
        error: {
          code: errorCode,
          message: errorMessage,
          details: details
        }
      };
    
      // 将错误信息通过飞书发送
      await sendToFeishu(`错误代码: ${errorCode}\n错误信息: ${errorMessage}\n详情: ${details || '无'}`);
    
      // 返回 HTTP 错误响应
      res.status(statusCode).json(errorResponse);
  }

// 处理 Ozon 发送的 REST 请求 (通知事件)
app.post('/ozon/events', async (req, res) => {
  try {
    const event = req.body;

    // 打印收到的事件，供调试用
    console.log('Received event from Ozon:', event);

    // 检查是否有缺失的参数
    if (!event.message_type) {
        return sendErrorResponse(res, 'ERROR_PARAMETER_VALUE_MISSED', 'Missing required parameter: message_type', null, 400);
    }

    // 如果是 "TYPE_PING" 消息类型，响应成功
    if (event.message_type === 'TYPE_PING') {
        console.log('Received PING from Ozon at', event.time);

        const response = {
          version: appVersion,
          name: appName,
          time: new Date().toISOString() // 以 UTC 格式发送当前时间
        };
  
        // 返回指定格式的响应
        return res.status(200).json(response);
    }

    // 处理其他事件类型
    await handleEvent(event, res);

    // 返回 200 状态码，表示成功处理事件
    res.status(200).json({ result: true });
  } catch (error) {
    console.error('Error processing event:', error);
    // 如果在处理过程中发生未知错误，捕获异常并返回 500 错误，附带更多的错误详情。
    // 返回服务器内部错误
    return sendErrorResponse(res, 'ERROR_UNKNOWN', 'An unknown error occurred', error.message, 500);
  }
});

// 根据事件类型处理不同的 Ozon 通知
async function handleEvent(event, res) {
  const eventType = event.message_type;  // 读取通知类型

  switch (eventType) {
    case 'TYPE_NEW_POSTING':
      await handleNewPosting(event);
      break;
    case 'ORDER_STATUS_UPDATED':
      await handleOrderStatusUpdated(event);
      break;
    case 'STOCK_LEVEL_UPDATED':
      await handleStockLevelUpdated(event);
      break;
    case 'PRICE_UPDATED':
      await handlePriceUpdated(event);
      break;
    default:
      await handleUnknownEvent(event, res);
      break;
  }
}

// 处理新订单事件
async function handleNewPosting(event) {
  if (!event.posting_number || !event.products) {
    return sendErrorResponse(res, 'ERROR_PARAMETER_VALUE_MISSED', 'Missing required parameters: posting_number or products', null, 400);
  }
  const postingNumber = event.posting_number;
  const products = event.products.map(product => `SKU: ${product.sku}, Quantity: ${product.quantity}`).join(', ');
  const inProcessAt = event.in_process_at;
  const warehouseId = event.warehouse_id;
  const sellerId = event.seller_id;

  const message = `New Posting Received:\nPosting Number: ${postingNumber}\nProducts: ${products}\nIn Process At: ${inProcessAt}\nWarehouse ID: ${warehouseId}\nSeller ID: ${sellerId}`;
  
  await sendToFeishu(message);
}

// 处理订单状态更新事件
async function handleOrderStatusUpdated(event) {
  const message = `Order status updated: Order ID ${event.data.order_id}, new status: ${event.data.status}`;
  await sendToFeishu(message);
}

// 处理库存水平更新事件
async function handleStockLevelUpdated(event) {
  const message = `Stock level updated: Product ID ${event.data.product_id}, new stock: ${event.data.stock}`;
  await sendToFeishu(message);
}

// 处理价格更新事件
async function handlePriceUpdated(event) {
  const message = `Price updated: Product ID ${event.data.product_id}, new price: ${event.data.price}`;
  await sendToFeishu(message);
}

// 处理未知事件
async function handleUnknownEvent(event) {
  const message = `Unknown event received: ${JSON.stringify(event)}`;
  await sendToFeishu(message);
  return sendErrorResponse(res, 'ERROR_PARAMETER_VALUE_MISSED', 'Missing required parameter: message_type', null, 400);
}

// 将消息发送到飞书
async function sendToFeishu(message) {
  try {
    await axios.post(FEISHU_WEBHOOK_URL, {
      msg_type: 'text',
      content: {
        text: message,
      },
    });
    console.log('Message sent to Feishu');
  } catch (error) {
    console.error('Failed to send message to Feishu:', error);
    throw error;
  }
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
