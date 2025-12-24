export default function Table({columns, rows, onRowClick}){
  return (
    <table style={{width:'100%', borderCollapse:'collapse'}}>
      <thead>
        <tr>
          {columns.map(c=>(
            <th key={c.key} style={{textAlign:'left', borderBottom:'1px solid #ddd', padding:8}}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r=>(
          <tr key={r.id} onClick={()=>onRowClick?.(r)} style={{cursor:onRowClick?'pointer':'default'}}>
            {columns.map(c=>(
              <td key={c.key} style={{borderBottom:'1px solid #f2f2f2', padding:8}}>
                {c.render ? c.render(r[c.key], r) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
