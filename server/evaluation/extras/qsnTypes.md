# ✅ **The 7 Categories in Your RAG Evaluation (Explained Clearly)**

Your test set covers **7 types of questions**, each designed to test a different capability of the RAG system.  
Below is **each category**, **what it means**, and **why your example fits it**.

***

# 1️⃣ **direct\_fact**

### **What it tests**

*   Simple, single-sentence factual lookup
*   No reasoning required
*   Answer exists clearly in one chunk of text

### **Examples**

*   “What is the monthly cost of Homellm's Standard Tier?”
*   “What is Maxine Thompson's current salary?”

### **Why this category is easy**

Just retrieve → read → answer.

***

# 2️⃣ **comparative**

### **What it tests**

*   Comparing two values
*   Or identifying a change, improvement, difference
*   Requires context involving **before vs after** or **A vs B**

### **Examples**

*   “How much did Priya Sharma’s recommendation engine increase conversion by?”
*   “By what percentage did David Kim reduce deployment time?”

### **Why this is harder**

Compared to factual lookup, model must:

*   Find the correct number
*   Understand it as an *improvement metric*

***

# 3️⃣ **temporal**

### **What it tests**

*   Retrieval of **dates, timelines, or time-based events**

### **Examples**

*   “When was the Evergreen Life Insurance Lifellm contract signed?”
*   “When was the GreenValley Insurance Homellm contract signed?”

### **Why this is distinct**

Dates can be easy to mix up if:

*   Documents mention multiple timelines
*   Retrieval brings a similar contract with a different date

***

# 4️⃣ **numerical**

### **What it tests**

*   Pure numeric values
*   Counts, totals, quantities

### **Examples**

*   “How many employees did Insurellm have at its peak in 2020?”
*   “How many active policies does Evergreen Life Insurance manage?”

### **What makes it tricky**

Numerical hallucinations are common if retrieval is weak.

***

# 5️⃣ **relationship**

### **What it tests**

*   People → role
*   Person → product
*   Person → action
*   Org → representative

### **Examples**

*   “Which product does Tyler Brooks work on?”
*   “Who signed the Summit Commercial Insurance contract?”

### **Why it matters**

Tests entity linking:  
*Does the model understand how two entities relate in the dataset?*

***

# 6️⃣ **holistic**

### **What it tests**

*   Multi-document aggregation
*   Summing totals
*   Comparing product lines
*   Requires **gathering information across multiple chunks**

### **Examples**

*   “What is the total contract value of all Healthllm contracts?”
*   “Which product line has the most active contracts?”

### **Why this is difficult**

Needs:

*   Retrieval of multiple documents
*   Summation or aggregation
*   No hallucination

This usually lowers completeness if retrieval misses one piece.

***

# 7️⃣ **spanning**

### **What it tests**

*   Pulling facts from **multiple different parts** of the document
*   Combining them into a single answer
*   Often involves:
    *   A person (name)
    *   A job role
    *   An award
    *   A date or salary

### **Examples**

*   “What product does the IIOTY award winner work on?”
*   “What is the salary of the CTO who joined in January 2017?”

### **Why this is among the hardest**

The model must:

*   Identify the person
*   Retrieve different attributes from different places
*   Combine them correctly

Spanning = multi-hop reasoning without explicit “compare”.

***

# 🎯 **Summary Table**

| Category         | What it measures           | Difficulty  | Example from your list        |
| ---------------- | -------------------------- | ----------- | ----------------------------- |
| **direct\_fact** | Simple fact retrieval      | Easy        | Monthly cost of Standard Tier |
| **comparative**  | Improvements / differences | Medium      | % conversion increase         |
| **temporal**     | Dates & timelines          | Easy–Medium | Contract signed date          |
| **numerical**    | Numbers, counts            | Medium      | Peak employee count           |
| **relationship** | Person–role–product links  | Medium      | Who signed contract           |
| **holistic**     | Multi-document aggregation | Hard        | Total contract value          |
| **spanning**     | Multi-hop fact combination | Very hard   | IIOTY award winner's role     |


