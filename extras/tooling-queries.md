Since your tools are:

```text
getOrderStatus(orderId)
getOrderItems(orderId)
getUserOrders(userId)
cancelOrder(orderId)
```

and your DB contains **users, orders, products, and order_items**, you should test prompts that naturally trigger those tools.

Below are **good sample queries grouped by tool**.

---

# 1️⃣ Test `getOrderStatus`

These should make the model call:

```json
{ "tool": "getOrderStatus", "arguments": { "orderId": X } }
```

Example prompts:

```
What is the status of order 1?
```

```
Check the status for order 2
```

```
Has order 3 been delivered?
```

```
Is order 4 cancelled or still processing?
```

```
Tell me the status of order number 5
```

---

# 2️⃣ Test `getOrderItems`

These should trigger:

```json
{ "tool": "getOrderItems", "arguments": { "orderId": X } }
```

Example prompts:

```
What items are in order 1?
```

```
Show the products in order 2
```

```
List everything that was purchased in order 3
```

```
What did the user buy in order 4?
```

```
Give me the item details of order 5
```

---

# 3️⃣ Test `getUserOrders`

Should trigger:

```json
{ "tool": "getUserOrders", "arguments": { "userId": X } }
```

Example prompts:

```
Show all orders for user 1
```

```
What orders does user 2 have?
```

```
List the orders belonging to user 3
```

```
Does user 4 have any orders?
```

```
Give me the order history for user 5
```

---

# 4️⃣ Test `cancelOrder`

Should trigger:

```json
{ "tool": "cancelOrder", "arguments": { "orderId": X } }
```

Example prompts:

```
Cancel order 2
```

```
Please cancel order number 3
```

```
Stop processing order 5
```

```
I want to cancel order 1
```

```
Remove order 4
```

---

# 5️⃣ Multi-step reasoning queries (best tests)

These are **great for agent testing**.

```
What items are in order 1 and what is its status?
```

```
Show orders for user 1 and tell me which are shipped
```

```
Cancel order 2 and confirm its status
```

```
List the items in order 3 and their quantities
```

```
Does user 1 have any shipped orders?
```

---

# 6️⃣ Queries that SHOULD NOT trigger tools

Good to test LLM behavior.

```
Hello
```

```
Explain what an order management system is
```

```
What is the capital of India?
```

```
How does a database work?
```

---

# 7️⃣ Very useful debug prompt

This forces tool usage.

```
You must use tools to answer.
What is the status of order 1?
```

---

# Tip for better tool triggering

In your **system prompt**, add:

```
Always use tools when the question involves orders, users, or products.
Do not guess database information.
```

This improves tool selection.

---

If you want, I can also give you **10 advanced prompts that break weak LLM agents**.
These are used by AI engineers to test whether **tool-calling agents are actually reliable**.
