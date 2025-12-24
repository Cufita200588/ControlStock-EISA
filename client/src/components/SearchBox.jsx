export default function SearchBox({value, onChange, placeholder='Buscar...'}) {
  return (
    <input
      style={{padding:8, width:'100%', maxWidth:380, border:'1px solid #ccc', borderRadius:6}}
      value={value}
      onChange={e=>onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}
