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
import Imports from "./pages/Imports";
import { useAuth } from "./context/AuthContext";

export default function App() {
  const { session, loading, profile } = useAuth();
  const [view, setView] = useState("dashboard");

  const rol = profile?.rol;

  // Redirigir según rol
  useEffect(() => {
    if (!rol) return;
    if (rol === "operario" || rol === "lectura") {
      setView("kanban");
    } else if (rol === "importaciones") {
      setView("importaciones");
    }
  }, [rol]);

  const isAdmin      = rol === "admin";
  const isImport     = rol === "importaciones";
  const isOperario   = rol === "operario";
  const isLectura    = rol === "lectura";

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

  if (!profile) return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ background: "white", borderRadius: "20px", padding: "40px", border: "1px solid #e2e8f0", textAlign: "center" }}>
        <h3 style={{ margin: "0 0 8px" }}>Perfil no encontrado</h3>
        <p style={{ color: "#94a3b8", margin: 0 }}>Este usuario no tiene un registro en profiles. Contacta al administrador.</p>
      </div>
    </div>
  );

  return (
    <Layout currentView={view} setCurrentView={setView}>
      {/* Admin tiene acceso a todo */}
      {isAdmin && view === "dashboard"      && <Dashboard />}
      {isAdmin && view === "kanban"         && <Kanban />}
      {isAdmin && view === "create"         && <CreateOrder />}
      {isAdmin && view === "envios"         && <Shipments />}
      {isAdmin && view === "clientes"       && <Clients />}
      {isAdmin && view === "inventario"     && <Inventory />}
      {isAdmin && view === "finanzas"       && <Finance />}
      {isAdmin && view === "importaciones"  && <Imports />}

      {/* Importaciones tiene acceso a importaciones + inventario + finanzas + dashboard */}
      {isImport && view === "importaciones" && <Imports />}
      {isImport && view === "inventario"    && <Inventory />}
      {isImport && view === "finanzas"      && <Finance />}
      {isImport && view === "dashboard"     && <Dashboard />}

      {/* Operario solo ve kanban */}
      {isOperario && view === "kanban" && <Kanban />}

      {/* Lectura solo ve kanban */}
      {isLectura && view === "kanban" && <Kanban />}
    </Layout>
  );
}
