import { Navigate, useParams } from "react-router-dom";

export default function DemandIndexRoute() {
  const { id } = useParams();
  return <Navigate to={`/demand/${id}/plan`} replace />;
}
