import express from "express";
import { OrderInputSchema } from "./types";
import { bookWithQuantity, orderbook } from "./orderbook";

const app = express();

const BASE_ASSET = "BTC";
const QUOTE_ASSET = "USD";

app.use(express.json());

let GLOBAL_TRADE_ID = 0;

app.post("/api/v1/order", (req, res) => {
  orderbook.asks.sort((a, b) => a.price - b.price);
  orderbook.asks.sort((a, b) => a.price - b.price);

  const order = OrderInputSchema.safeParse(req.body);
  if (!order.success) {
    res.status(400).send(order.error.message);
    return;
  }
  const { baseAsset, quoteAsset, price, quantity, side, kind } = order.data;
  const orderId = getOrderId();

  if (baseAsset !== BASE_ASSET || quoteAsset !== QUOTE_ASSET) {
    res.status(400).send("Invalid base or quote asset");
    return;
  }
  const { status, executedQty, fills } = fillOrder(
    orderId,
    price,
    quantity,
    side,
    kind
  );
  console.log("orderbook ", orderbook);
  console.log("bookwithqunatity ", bookWithQuantity);
  res.send({ status, orderId, executedQty, fills });
});

interface Fill {
  price: number;
  qty: number;
  tradeId: number;
}

function fillOrder(
  orderId: string,
  price: number,
  quantity: number,
  side: "buy" | "sell",
  type?: "ioc"
): { status: "rejected" | "accepted"; executedQty: number; fills: Fill[] } {
  const fills: Fill[] = [];
  const maxFillQUantity = getFillAmount(price, quantity, side);

  let executedQty = 0;
  if (type == "ioc" && maxFillQUantity < quantity) {
    return { status: "rejected", executedQty: maxFillQUantity, fills: [] };
  }

  if (side === "buy") {
    orderbook.asks.forEach((order) => {
      if (order.price <= price && quantity > 0) {
        const filled = Math.min(quantity, order.quantity);
        order.quantity -= filled;
        bookWithQuantity.asks[order.price] =
          (bookWithQuantity.asks[order.price] || 0) - filled;
        fills.push({
          price: order.price,
          qty: filled,
          tradeId: GLOBAL_TRADE_ID++,
        });
        executedQty += filled;
        quantity -= filled;
        if (order.quantity === 0) {
          orderbook.asks.splice(orderbook.asks.indexOf(order), 1);
        }
        if (bookWithQuantity.asks[price] === 0) {
          delete bookWithQuantity.asks[price];
        }
      }
    });

    if (quantity !== 0) {
      orderbook.bids.push({ price, quantity, side: "bid", orderId });
      bookWithQuantity.bids[price] =
        (bookWithQuantity.bids[price] || 0) + quantity;
    }
  } else {
    orderbook.bids.forEach((o) => {
      if (o.price >= price && quantity > 0) {
        const filledQuantity = Math.min(quantity, o.quantity);
        o.quantity -= filledQuantity;
        bookWithQuantity.bids[price] =
          (bookWithQuantity.bids[price] || 0) - filledQuantity;
        fills.push({
          price: o.price,
          qty: filledQuantity,
          tradeId: GLOBAL_TRADE_ID++,
        });
        executedQty += filledQuantity;
        quantity -= filledQuantity;
        if (o.quantity === 0) {
          orderbook.bids.splice(orderbook.bids.indexOf(o), 1);
        }
        if (bookWithQuantity.bids[price] === 0) {
          delete bookWithQuantity.bids[price];
        }
      }
    });

    // Place on the book if order not filled
    if (quantity !== 0) {
      orderbook.asks.push({
        price,
        quantity: quantity,
        side: "ask",
        orderId,
      });
      bookWithQuantity.asks[price] =
        (bookWithQuantity.asks[price] || 0) + quantity;
    }
  }
  orderbook.bids.sort((a, b) => a.price - b.price);
  orderbook.asks.sort((a, b) => a.price - b.price);

  return { status: "accepted", executedQty, fills };
}

function getFillAmount(price: number, quantity: number, side: "buy" | "sell") {
  let fillAmount = 0;

  if (side === "buy") {
    orderbook.asks.forEach((o) => {
      if (o.price <= price) {
        fillAmount += Math.min(quantity, o.quantity);
      }
    });
  } else {
    orderbook.bids.forEach((order) => {
      if (order.price >= price) {
        fillAmount += Math.min(quantity, order.quantity);
      }
    });
  }
  return fillAmount;
}

function getOrderId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

app.listen(5000, () => {
  console.log("listening on port 5000");
});
