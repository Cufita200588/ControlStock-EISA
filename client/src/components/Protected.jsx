import { Navigate } from "react-router-dom";
import { getToken } from "../auth";

export default function Protected({children}) {
  const t = getToken();
  if (!t) return <Navigate to="/login" replace />;
  return children;
}
