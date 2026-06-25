function fmtMoney(v) {
  if (!isFinite(v)) return "—";
  return "$" + Math.round(v).toLocaleString();
}

export default function MortSchedule({ rows, open }) {
  if (!open) return null;
  return (
    <div className="schedule open">
      <table>
        <thead>
          <tr>
            <th>mo</th>
            <th>payment</th>
            <th>principal</th>
            <th>interest</th>
            <th>balance</th>
            <th>equity</th>
            <th>cum. interest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.m} className={r.m % 12 === 0 ? "year-end" : ""}>
              <td>{r.m}</td>
              <td>{fmtMoney(r.payment)}</td>
              <td>{fmtMoney(r.principal)}</td>
              <td>{fmtMoney(r.interest)}</td>
              <td>{fmtMoney(r.balance)}</td>
              <td>{fmtMoney(r.equity)}</td>
              <td>{fmtMoney(r.cumInterest)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
