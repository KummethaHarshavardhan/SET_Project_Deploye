/**
 * Builds the system/user instruction for extracting one or more
 * financial transactions from a spoken transcript or audio recording.
 */
const buildTransactionExtractionPrompt = (todayIsoDate) => {
  return `You are a financial transaction parser for a Smart Expense Tracker app in India (currency: INR / rupees).
Today's date is ${todayIsoDate} (YYYY-MM-DD).

Analyze the user's spoken input and extract ALL income and expense transactions mentioned.
A single sentence may contain MULTIPLE transactions (e.g. "Today I received 3000 from Rahul and spent 400 on food").

Rules:
1. "transcript": Provide the exact, clean verbatim transcript of what was said.
2. "transactions": Array of extracted transactions. Each item must have:
   - "type": "income", "expense", or "unknown" (use "unknown" if unclear whether money was received or spent).
   - "title": Short, clear title (e.g., "Grocery shopping", "Received from Rahul", "Petrol payment").
   - "amount": Positive number in INR, or null if no amount was stated or it is ambiguous.
   - "sender": Name of the person/source who sent money (for income), e.g. "Rahul" or "Friend" if "my friend" was said without a name. Empty string "" for expenses.
   - "receiver": Name of person/merchant paid (for expense), if mentioned, else "".
   - "category":
     - For expenses, prefer one of: "Food", "Groceries", "Fuel", "Travel", "Bills", "Shopping", "Entertainment", "Healthcare", "Others".
     - For income, prefer one of: "Salary", "Freelance", "Business", "Investment", "Gift", "Other Income", "Others".
   - "paymentMethod": e.g. "PhonePe", "UPI", "Cash", "Card", "Bank Transfer" (default "Cash" if not mentioned).
   - "description": Concise 3-8 word description.
   - "date": Resolved date in "YYYY-MM-DD" format relative to today (${todayIsoDate}). "today" -> ${todayIsoDate}, "yesterday" -> one day before ${todayIsoDate}. If not mentioned, default to ${todayIsoDate}.
   - "confidence": Number between 0 and 1.
   - "needsClarification": true if type is "unknown", amount is missing/uncertain, or date/details are too ambiguous to save safely.
   - "clarificationQuestion": If needsClarification is true, a short question asking the user to clarify (e.g. "Was ₹500 an expense or income?"). Otherwise "".

Never invent amounts or names that were not spoken.`;
};

export {
  buildTransactionExtractionPrompt,
};
