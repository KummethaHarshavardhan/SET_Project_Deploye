import Expense from '../../models/Expense.js';
import Income from '../../models/Income.js';

const getMonthRange = (monthOffset = 0) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  const label = start.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return { start, end, label };
};

const getMonthlyIncome = async (userId, monthOffset = 0) => {
  const { start, end, label } = getMonthRange(monthOffset);
  const agg = await Income.aggregate([
    { $match: { user: userId, date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return { total: agg[0]?.total || 0, count: agg[0]?.count || 0, period: label };
};

const getMonthlyExpenses = async (userId, monthOffset = 0) => {
  const { start, end, label } = getMonthRange(monthOffset);
  const agg = await Expense.aggregate([
    { $match: { user: userId, date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return { total: agg[0]?.total || 0, count: agg[0]?.count || 0, period: label };
};

const getCategoryExpenses = async (userId, category, monthOffset = 0) => {
  const match = {
    user: userId,
    category: { $regex: new RegExp(`^${category}$`, 'i') },
  };
  let period = 'all time';
  if (monthOffset !== null) {
    const { start, end, label } = getMonthRange(monthOffset);
    match.date = { $gte: start, $lte: end };
    period = label;
  }
  const agg = await Expense.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return {
    category,
    total: agg[0]?.total || 0,
    count: agg[0]?.count || 0,
    period,
  };
};

const getBalance = async (userId) => {
  const [expAgg, incAgg] = await Promise.all([
    Expense.aggregate([
      { $match: { user: userId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Income.aggregate([
      { $match: { user: userId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  const totalIncome = incAgg[0]?.total || 0;
  const totalExpense = expAgg[0]?.total || 0;
  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
};

const getLargestExpenses = async (userId, limit = 3) => {
  const items = await Expense.find({ user: userId })
    .sort({ amount: -1 })
    .limit(limit)
    .lean();
  return items.map((e) => ({
    title: e.title,
    amount: e.amount,
    category: e.category,
    date: e.date instanceof Date ? e.date.toISOString().split('T')[0] : e.date,
  }));
};

const searchTransactions = async (userId, keyword) => {
  const regex = new RegExp(keyword, 'i');
  const [expenses, incomes] = await Promise.all([
    Expense.find({
      user: userId,
      $or: [{ title: regex }, { category: regex }, { description: regex }],
    })
      .sort({ date: -1 })
      .limit(10)
      .lean(),
    Income.find({
      user: userId,
      $or: [
        { title: regex },
        { category: regex },
        { sender: regex },
        { description: regex },
      ],
    })
      .sort({ date: -1 })
      .limit(10)
      .lean(),
  ]);
  return { expenses, incomes };
};

const compareMonthlyTransactions = async (userId) => {
  const [thisMonthExp, lastMonthExp, thisMonthInc, lastMonthInc] = await Promise.all([
    getMonthlyExpenses(userId, 0),
    getMonthlyExpenses(userId, -1),
    getMonthlyIncome(userId, 0),
    getMonthlyIncome(userId, -1),
  ]);
  return { thisMonthExp, lastMonthExp, thisMonthInc, lastMonthInc };
};

const getTransactionsByPerson = async (userId, personName) => {
  const regex = new RegExp(personName, 'i');
  const incomes = await Income.find({
    user: userId,
    $or: [{ sender: regex }, { title: regex }, { description: regex }],
  })
    .sort({ date: -1 })
    .lean();
  const total = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  return { personName, total, count: incomes.length, incomes };
};

const getRecentTransactions = async (userId, limit = 5) => {
  const [expenses, incomes] = await Promise.all([
    Expense.find({ user: userId }).sort({ date: -1 }).limit(limit).lean(),
    Income.find({ user: userId }).sort({ date: -1 }).limit(limit).lean(),
  ]);
  return { expenses, incomes };
};

/**
 * Computes complete verified MongoDB financial context for Gemini prompts.
 */
const getUserFinancialContext = async (userId) => {
  const [bal, comp, largest, recent, allCats] = await Promise.all([
    getBalance(userId),
    compareMonthlyTransactions(userId),
    getLargestExpenses(userId, 3),
    getRecentTransactions(userId, 8),
    Expense.aggregate([
      { $match: { user: userId } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
  ]);

  const now = new Date();
  return {
    todayIso: now.toISOString().split('T')[0],
    currentMonthName: comp.thisMonthExp.period,
    lastMonthName: comp.lastMonthExp.period,
    totals: {
      totalIncome: bal.totalIncome,
      totalExpense: bal.totalExpense,
      remainingBalance: bal.balance,
      thisMonthIncome: comp.thisMonthInc.total,
      thisMonthExpense: comp.thisMonthExp.total,
      lastMonthIncome: comp.lastMonthInc.total,
      lastMonthExpense: comp.lastMonthExp.total,
    },
    expensesByCategoryAllTime: allCats.map((c) => ({
      category: c._id,
      total: c.total,
      count: c.count,
    })),
    highestExpense: largest[0] || null,
    recentExpenses: recent.expenses.map((e) => ({
      title: e.title,
      amount: e.amount,
      category: e.category,
      date: e.date instanceof Date ? e.date.toISOString().split('T')[0] : e.date,
    })),
    recentIncomes: recent.incomes.map((i) => ({
      title: i.title,
      amount: i.amount,
      sender: i.sender || '',
      date: i.date instanceof Date ? i.date.toISOString().split('T')[0] : i.date,
    })),
  };
};

const KNOWN_CATEGORIES = [
  'Food',
  'Groceries',
  'Fuel',
  'Travel',
  'Bills',
  'Shopping',
  'Entertainment',
  'Healthcare',
  'Others',
];

/**
 * Directly answers recognized financial queries using MongoDB aggregations
 * without waiting on Gemini (works instantaneously even if Gemini is 503).
 */
const tryDirectMongoAnswer = async ({ userId, text, history = [] }) => {
  const q = (text || '').trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  // Do NOT intercept transaction creation statements
  if (
    /\b(spent|paid|bought|received|sent me|earned|got|added|spend)\b/i.test(lower) &&
    /\d+/.test(lower)
  ) {
    return null;
  }

  // Resolve follow-up "what about last month?" from previous user message
  const isFollowUpLastMonth =
    /^(what|how)\s+about\s+last\s+month\??$/i.test(lower) ||
    /^and\s+last\s+month\??$/i.test(lower);

  let effectiveLower = lower;
  let monthOffset = lower.includes('last month') ? -1 : 0;
  if (isFollowUpLastMonth) {
    monthOffset = -1;
    const prevUserMsg = [...history]
      .reverse()
      .find((m) => m.role === 'user' && !/last\s+month/i.test(m.text));
    if (prevUserMsg) {
      effectiveLower = `${prevUserMsg.text.toLowerCase()} last month`;
    }
  }

  // 1. Category spending query (e.g. "How much did I spend on food this month?")
  for (const cat of KNOWN_CATEGORIES) {
    if (effectiveLower.includes(cat.toLowerCase())) {
      const useOffset =
        effectiveLower.includes('this month') || effectiveLower.includes('last month')
          ? monthOffset
          : null;
      const res = await getCategoryExpenses(userId, cat, useOffset);
      if (res.count === 0) {
        return `You have ₹0 in ${cat} expenses for ${res.period}.`;
      }
      return `You spent ₹${res.total.toLocaleString('en-IN')} on ${cat} (${res.count} ${
        res.count === 1 ? 'transaction' : 'transactions'
      }) in ${res.period}.`;
    }
  }

  // 2. Compare this month vs last month
  if (effectiveLower.includes('compare') && effectiveLower.includes('month')) {
    const comp = await compareMonthlyTransactions(userId);
    const diff = comp.thisMonthExp.total - comp.lastMonthExp.total;
    const trend = diff > 0 ? `₹${diff.toLocaleString('en-IN')} higher` : `₹${Math.abs(diff).toLocaleString('en-IN')} lower`;
    return `In ${comp.thisMonthExp.period}, your expenses are ₹${comp.thisMonthExp.total.toLocaleString(
      'en-IN'
    )} compared to ₹${comp.lastMonthExp.total.toLocaleString('en-IN')} in ${
      comp.lastMonthExp.period
    } (${trend}).`;
  }

  // 3. Monthly savings
  if (effectiveLower.includes('save') || effectiveLower.includes('savings')) {
    const comp = await compareMonthlyTransactions(userId);
    const inc = monthOffset === -1 ? comp.lastMonthInc : comp.thisMonthInc;
    const exp = monthOffset === -1 ? comp.lastMonthExp : comp.thisMonthExp;
    const savings = inc.total - exp.total;
    return `In ${inc.period}, your income is ₹${inc.total.toLocaleString(
      'en-IN'
    )} and expenses are ₹${exp.total.toLocaleString(
      'en-IN'
    )}, so your net savings are ₹${savings.toLocaleString('en-IN')}.`;
  }

  // 4. Total income this/last month
  if (effectiveLower.includes('income') && (effectiveLower.includes('month') || isFollowUpLastMonth)) {
    const inc = await getMonthlyIncome(userId, monthOffset);
    return `Your total income in ${inc.period} is ₹${inc.total.toLocaleString('en-IN')} across ${inc.count} ${
      inc.count === 1 ? 'record' : 'records'
    }.`;
  }

  // 5. Total expense this/last month
  if (
    (effectiveLower.includes('expense') || effectiveLower.includes('spend')) &&
    (effectiveLower.includes('month') || isFollowUpLastMonth)
  ) {
    const exp = await getMonthlyExpenses(userId, monthOffset);
    return `Your total expenses in ${exp.period} are ₹${exp.total.toLocaleString('en-IN')} across ${exp.count} ${
      exp.count === 1 ? 'transaction' : 'transactions'
    }.`;
  }

  // 6. Current / total balance
  if (effectiveLower.includes('balance') || effectiveLower.includes('remaining')) {
    const bal = await getBalance(userId);
    return `Your current balance is ₹${bal.balance.toLocaleString(
      'en-IN'
    )} (Total Income: ₹${bal.totalIncome.toLocaleString(
      'en-IN'
    )}, Total Expenses: ₹${bal.totalExpense.toLocaleString('en-IN')}).`;
  }

  // 7. Highest / largest expense
  if (
    effectiveLower.includes('highest') ||
    effectiveLower.includes('largest') ||
    effectiveLower.includes('biggest')
  ) {
    const top = await getLargestExpenses(userId, 1);
    if (top.length === 0) {
      return 'You have no recorded expenses yet.';
    }
    const item = top[0];
    return `Your highest expense is "${item.title}" for ₹${item.amount.toLocaleString(
      'en-IN'
    )} (${item.category}) on ${item.date}.`;
  }

  // 8. Recent transactions
  if (effectiveLower.includes('recent') || effectiveLower.includes('latest')) {
    const recent = await getRecentTransactions(userId, 3);
    if (recent.expenses.length === 0 && recent.incomes.length === 0) {
      return 'You have no recent transactions yet.';
    }
    const expText = recent.expenses
      .map((e) => `• ${e.title}: ₹${e.amount.toLocaleString('en-IN')} (${e.category})`)
      .join('\n');
    const incText = recent.incomes
      .map((i) => `• ${i.title}: +₹${i.amount.toLocaleString('en-IN')}`)
      .join('\n');
    return `Here are your latest transactions:\n${
      expText ? `Expenses:\n${expText}\n` : ''
    }${incText ? `Income:\n${incText}` : ''}`.trim();
  }

  // 9. Person income query: "How much did <Name> send me?"
  const personMatch = q.match(/how\s+much\s+did\s+([a-zA-Z]+)\s+send/i);
  if (personMatch && personMatch[1]) {
    const person = personMatch[1].trim();
    const res = await getTransactionsByPerson(userId, person);
    if (res.count === 0) {
      return `I found no income records from ${person}.`;
    }
    return `${person} sent you a total of ₹${res.total.toLocaleString('en-IN')} across ${res.count} ${
      res.count === 1 ? 'transaction' : 'transactions'
    }.`;
  }

  return null;
};

export {
  getMonthlyIncome,
  getMonthlyExpenses,
  getCategoryExpenses,
  getBalance,
  getLargestExpenses,
  searchTransactions,
  compareMonthlyTransactions,
  getTransactionsByPerson,
  getRecentTransactions,
  getUserFinancialContext,
  tryDirectMongoAnswer,
};
