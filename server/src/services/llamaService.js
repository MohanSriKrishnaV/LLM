import axios from 'axios'
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434'
const MODEL_NAME = process.env.MODEL_NAME || 'qwen2.5:3b';
import { chatService } from './chatService.js';
import dbPromise from '../db/database.js';

//TOOLS USAGE 
const DEFAULT_SYSTEM_PROMPT = `
You are an order assistant.
Rules:
1. If the user asks about an order or wants to cancel an order, call the appropriate tool.
2. If the user greets you or asks a general question unrelated to orders, respond normally.
3. If the user asks for help, explain what you can do.

If the user asks about orders, users, or products,
always prefer using tools instead of guessing.

After receiving tool results, summarize them clearly for the user.
`

// Simple token estimation (rough approximation)
const estimateTokens = (text) => {
  // Rough approximation: ~4 characters per token for English text
  return Math.ceil(text.length / 4)
}

// Cost estimation using OpenAI pricing as reference
const estimateCost = (inputTokens, outputTokens, model = 'gpt-3.5-turbo') => {
  const pricing = {
    'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gemma3:270m': { input: 0, output: 0 } // Free local model
  }
  
  const rates = pricing[model] || pricing['gpt-3.5-turbo']
  const inputCost = (inputTokens / 1000) * rates.input
  const outputCost = (outputTokens / 1000) * rates.output
  
  return {
    inputCost: inputCost.toFixed(6),
    outputCost: outputCost.toFixed(6),
    totalCost: (inputCost + outputCost).toFixed(6),
    currency: 'USD'
  }
}



export const llamaService = {
//   tools embedded



// generateResponse: async (
//   message,
//   conversationHistory = [],
//   systemPrompt = DEFAULT_SYSTEM_PROMPT,
//   options = {}
// ) => {
//   try {

//     const {
//       temperature = 0.3,
//       maxTokens = 500,
//       topP = 0.9
//     } = options


// await chatService.saveMessage("user", message);
//     // Build system message
//     const systemMessage = systemPrompt + "\n\n" + buildToolPrompt()

//     // Filter recent conversation
//     // const recentMessages =
//     //   filterRecentMessages(conversationHistory)?.slice(0, 5) || []

//        const recentMessages = []

//     // console.log("recentMessages", recentMessages)

//     // Convert history into chat messages
//     const historyMessages = recentMessages?.map(msg => ({
//       role: msg.role === "user" ? "user" : "assistant",
//       content:
//         typeof msg.content === "string"
//           ? msg.content
//           : "[Corrupted message]"
//     }))

//     // Final messages array
//     const messages = [
//       { role: "system", content: systemMessage },
//       ...historyMessages,
//       { role: "user", content: message }
//     ]

//     // console.log("messages sent to LLM:", messages)

//     const inputTokens = estimateTokens(JSON.stringify(messages))

//     const response = await axios.post(
//       `${OLLAMA_API_URL}/api/chat`,
//       {
//         model: MODEL_NAME,
//         messages: messages,
//         stream: false,
//         options: {
//           temperature,
//           num_predict: maxTokens,
//           top_p: topP
//         }
//       }
//     )

//     // console.log("response received", response.data)

//     const rawResponse =
//       response.data?.message?.content?.trim() || ""

//     // console.log("LLM raw response:", rawResponse)

//     const outputTokens = estimateTokens(rawResponse)

//     const cost = estimateCost(inputTokens, outputTokens)

//     // Detect tool call
//     console.log("rawResponse", rawResponse)
//     const toolCall = parseToolCall(rawResponse)

//     console.log("toolCall", toolCall)

//    if (toolCall) {

//   const matchingTool =
//     TOOLS.find(tool => tool.name === toolCall.tool)

//   console.log("matchingTool", matchingTool)

//   if (!matchingTool) {
//     return {
//       type: "text",
//       message: "Requested tool not found.",
//       usage: {
//         inputTokens,
//         outputTokens,
//         totalTokens: inputTokens + outputTokens,
//         cost
//       }
//     }
//   }

//   // EXECUTE TOOL
//   const toolResult = await executeTool(
//     matchingTool.name,
//     toolCall.arguments
//   )

//   console.log("toolResult", toolResult)


//   // SECOND LLM CALL WITH TOOL RESULT
//   const toolresultcall = await axios.post(
//     `${OLLAMA_API_URL}/api/chat`,
//     {
//       model: MODEL_NAME,
//       messages: [
//         ...messages,

//         {
//           role: "assistant",
//           content: JSON.stringify({
//             tool: matchingTool.name,
//             arguments: toolCall.arguments
//           })
//         },

//         {
//           role: "tool",
//           content: JSON.stringify(toolResult)
//         },
//          {
//         role: "user",
//         content:
//           "Using the tool result above, generate a clear, human-friendly response for the user."
//       }
//       ],
//       stream: false,
//       options: {
//         temperature,
//         num_predict: maxTokens,
//         top_p: topP
//       }
//     }
//   )

//   const finalMessage =
//     toolresultcall.data?.message?.content?.trim() || ""

//   console.log("finalMessage", finalMessage)

//   return {
//     type: "text",
//     message: finalMessage,
//     usage: {
//       inputTokens,
//       outputTokens,
//       totalTokens: inputTokens + outputTokens,
//       cost
//     }
//   }
// }

//     // Normal text response
//     return {
//       type: "text",
//       message: rawResponse,
//       usage: {
//         inputTokens,
//         outputTokens,
//         totalTokens: inputTokens + outputTokens,
//         cost
//       }
//     }

//   } catch (error) {

//     console.error("Error calling Ollama:", error.message)

//     throw new Error(
//       `Failed to get response from Ollama: ${error.message}`
//     )
//   }
// }



generateResponse: async (
  message,
  conversationHistory = [],
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  options = {}
) => {
  try {

    const {
      temperature = 0.3,
      maxTokens = 500,
      topP = 0.9
    } = options

    await chatService.saveMessage("user", message)

    const systemMessage =
      systemPrompt + "\n\n" + buildToolPrompt()

    let messages = [
      { role: "system", content: systemMessage },
      { role: "user", content: message }
    ]

    let iterations = 0
    const MAX_ITERATIONS = 5

    while (iterations < MAX_ITERATIONS) {
      console.log("iterno",iterations)

      iterations++

      const response = await axios.post(
        `${OLLAMA_API_URL}/api/chat`,
        {
          model: MODEL_NAME,
          messages: messages,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
            top_p: topP
          }
        }
      )

      const content =
        response.data?.message?.content?.trim() || ""

      console.log("LLM response:", content)

      const toolCall = parseToolCall(content)

      // If no tool requested → final answer
      if (!toolCall) {

        await chatService.saveMessage(
          "assistant",
          content
        )

        return {
          type: "text",
          message: content
        }
      }

      const matchingTool =
        TOOLS.find(t => t.name === toolCall.tool)

      if (!matchingTool) {

        return {
          type: "text",
          message: "Requested tool not found."
        }
      }

      console.log("Executing tool:", toolCall.tool)

      // Execute tool
      const toolResult = await executeTool(
        matchingTool.name,
        toolCall.arguments
      )

      console.log("toolResult:", toolResult)

      // Add assistant tool request
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          tool: matchingTool.name,
          arguments: toolCall.arguments
        })
      })

      // Add tool result
      messages.push({
        role: "tool",
        content: JSON.stringify(toolResult)
      })

      // Instruction so model knows what to do next
      messages.push({
        role: "user",
        content:
          "Use the tool result above to continue solving the user request. If more data is needed call another tool. Otherwise respond with the final answer in a friendly way."
      })

    }

    // Safety fallback
    return {
      type: "text",
      message:
        "Sorry, I couldn't complete the request after multiple tool attempts."
    }

  } catch (error) {

    console.error(
      "Error calling Ollama:",
      error.message
    )

    throw new Error(
      `Failed to get response from Ollama: ${error.message}`
    )
  }
}


}




function filterRecentMessages(history) {
  const today = new Date().toDateString()
if (!history) return []
  return history.filter(msg => {
    if (!msg.timestamp) return true

    const msgDate = new Date(msg.timestamp).toDateString()
    return msgDate === today
  })
}




// Tools
function buildToolPrompt() {
  let toolPrompt = `You can use tools only  when needed.

Available tools:\n`

  TOOLS.forEach(tool => {
    toolPrompt += `
Tool: ${tool.name}
Description: ${tool.description}
Parameters: ${tool.parameters.join(", ")}
`
  })

  toolPrompt += `

If a tool is required respond ONLY in JSON:

{
 "tool": "tool_name",
 "arguments": {}
}

If no tool is required respond normally.
`

  return toolPrompt
}


// Detect tool calls
function parseToolCall(text) {
  try {
    const parsed = JSON.parse(text)
    if (parsed.tool) {
      return parsed
    }
  } catch (err) {
    return null
  }
  return null
}




const TOOLS = [
  {
    name: "getOrderStatus",
    description: "Get order status by order ID",
    parameters: ["orderId"]
  },
  {
    name: "getOrderItemsandstatus",
    description: "Get order items and status by order ID",
    parameters: ["orderId"]   
  },
  {
    name: "getOrderItems",
    description: "Get items in an order",
    parameters: ["orderId"]
  },
  {
    name: "getUserOrders",
    description: "Get all orders for a user",
    parameters: ["userId"]
  },
  {
    name: "cancelOrder",
    description: "Cancel an order",
    parameters: ["orderId"]
  },
  {
  name: "getOrderDetails",
  description: "Get full order details including user, items, quantities, and status. Can filter by orderId or userName.",
  parameters: ["orderId", "userName"]
},
{
  name: "searchOrders",
  description: "Search orders with filters like userName, orderId, status",
  parameters: ["orderId", "userName", "status"]
},
{
  name: "getUserIdByName",
  description: "Fetch the user ID using the user's name",
  parameters: ["userName"]
}
]

async function executeTool(toolName, args) {

  switch (toolName) {

    case "getOrderStatus": {

      if (!args.orderId) {
        return { error: "orderId required" }
      }

      const order = await dbPromise.get(
        "SELECT status FROM orders WHERE id=?",
        [args.orderId]
      )

      if (!order) return { error: "Order not found" }

      return order
    }

    case "getOrderItems": {

      const items = await dbPromise.all(`
        SELECT p.name, oi.quantity
        FROM order_items oi
        JOIN products p
        ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `, [args.orderId])

      if (items.length === 0) {
        return { message: "No items found for this order" }
      }
return {
  orderId: args.orderId,
  items: items
}

    }

    case "getUserOrders": {

      const orders = await dbPromise.all(
        "SELECT * FROM orders WHERE user_id=?",
        [args.userId]
      )

      if (orders.length === 0) {
        return { message: "User has no orders" }
      }

      return orders
    }

    case "cancelOrder": {

      const order = await dbPromise.get(
        "SELECT status FROM orders WHERE id=?",
        [args.orderId]
      )

      if (!order) {
        return { error: "Order not found" }
      }

      if (order.status === "cancelled") {
        return { message: "Order already cancelled" }
      }

      if (order.status === "delivered") {
        return { error: "Delivered orders cannot be cancelled" }
      }

      await dbPromise.run(
        "UPDATE orders SET status='cancelled' WHERE id=?",
        [args.orderId]
      )

      return { success: true }
    }

  case "getOrderItemsandstatus": {

  if (!args.orderId) {
    return { error: "orderId required" }
  }

  const order = await dbPromise.get(
    "SELECT status FROM orders WHERE id=?",
    [args.orderId]
  )

  if (!order) {
    return { error: "Order not found" }
  }

  const items = await dbPromise.all(`
    SELECT p.name, oi.quantity
    FROM order_items oi
    JOIN products p
    ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `, [args.orderId])

  return {
    orderId: args.orderId,
    status: order.status,
    items: items
  }
}

case "getOrderDetails": {

  let query = `
  SELECT 
    o.id as order_id,
    u.name as user_name,
    o.status,
    p.name as product_name,
    oi.quantity
  FROM orders o
  JOIN users u ON o.user_id = u.id
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON oi.product_id = p.id
  `

  let params = []

  if (args.orderId) {
    query += " WHERE o.id = ?"
    params.push(args.orderId)
  }

  if (args.userName) {
    query += " WHERE u.name = ?"
    params.push(args.userName)
  }

  const result = await dbPromise.all(query, params)

  if (result.length === 0) {
    return { message: "No order found" }
  }

  return result
}


case "searchOrders": {

  let query = `
    SELECT 
      o.id AS order_id,
      u.name AS user_name,
      o.status,
      p.name AS product_name,
      oi.quantity
    FROM orders o
    JOIN users u ON o.user_id = u.id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE 1=1
  `

  const params = []

  if (args.orderId) {
    query += " AND o.id = ?"
    params.push(args.orderId)
  }

  if (args.userName) {
    query += " AND u.name = ?"
    params.push(args.userName)
  }

  if (args.status) {
    query += " AND o.status = ?"
    params.push(args.status)
  }

  const rows = await dbPromise.all(query, params)

  if (!rows || rows.length === 0) {
    return { message: "No matching orders found" }
  }

  return rows
}

case "getUserIdByName": {

  if (!args.userName) {
    return { error: "userName is required" }
  }

  const user = await dbPromise.get(
    `SELECT id, name, email FROM users WHERE name = ?`,
    [args.userName]
  )

  if (!user) {
    return { message: "User not found" }
  }

  return user
}



    default:
      return { error: "Unknown tool" }
  }
}