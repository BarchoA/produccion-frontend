import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Kanban from "./pages/Kanban";
import CreateOrder from "./pages/CreateOrder";
import Login from "./pages/Login";
import Inventory from "./pages/Inventory";
import Finance from "./pages/Finance";
import Dashboard from "./pages/Dashboard";
import Shipments from "./pages/Shipments";
import Clients from "./pages/Clients";
import { useAuth } from "./context/AuthContext";


function Placeholder({ title, text }) {
  return (
    <div style={{ borderRadius: "20px", border: "2px dashed #e2e8f0", background: "white", padding: "60px", textAlign: "center" }}>
      <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>{title}</h3>
      <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0 }}>{text}</p>
    </div>
  );
}

export default function App() {
  const { session, loading, profile } = useAuth();
  const [view, setView] = useState("dashboard");

  useEffect(() => {
    if (profile?.rol !== "admin" && view !== "kanban") {
      setView("kanban");
    }
  }, [profile, view]);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "40px", height: "40px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>Cargando...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <Layout currentView={view} setCurrentView={setView}>
      {!profile && (
        <Placeholder
          title="Perfil no encontrado"
          text="La sesión existe pero este usuario no tiene registro en profiles. Revisa la tabla profiles en Supabase."
        />
      )}
      {profile && view === "dashboard"  && <Dashboard />}
      {profile && view === "kanban"     && <Kanban />}
      {profile && view === "create"     && <CreateOrder />}
      {profile && view === "envios"     && <Shipments />}
      {profile && view === "clientes"   && <Clients />}
      {profile && view === "inventario" && <Inventory />}
      {profile && view === "finanzas"   && <Finance />}

    </Layout>
  );
}
