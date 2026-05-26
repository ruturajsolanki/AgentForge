import { useNavigate } from "react-router-dom";
import SettingsPanel from "../components/SettingsPanel";

export default function SettingsRoute() {
  const navigate = useNavigate();
  return <SettingsPanel open inline onClose={() => navigate("/demands")} />;
}
