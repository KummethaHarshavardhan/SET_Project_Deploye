import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";


function BarChart({ data = [] }) {
  const formattedData = (data || []).map((item) => ({
    month: item.month || item._id || item.name || "Month",
    amount: Number(item.total || item.amount || item.value || 0),
  }));

  return (
    <div className="bar-chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <ReBarChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fill: "#374151", fontSize: 12 }} />
          <YAxis tick={{ fill: "#374151", fontSize: 12 }} />
          <Tooltip
            formatter={(value) => `₹${Number(value).toLocaleString()}`}
            contentStyle={{
              backgroundColor: "#ffffff",
              color: "#111827",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
            }}
            itemStyle={{ color: "#111827" }}
            labelStyle={{ color: "#111827", fontWeight: 600 }}
          />
          <Bar dataKey="amount" fill="#2563eb" radius={[8, 8, 0, 0]} />
        </ReBarChart>
      </ResponsiveContainer>
    </div>
  );
}


export default BarChart;