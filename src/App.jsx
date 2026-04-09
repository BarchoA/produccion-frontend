import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Kanban from "./pages/Kanban";
import CreateOrder from "./pages/CreateOrder";
import Login from "./pages/Login";
import Inventory from "./pages/Inventory";
import { useAuth } from "./context/AuthContext";
import Finance from "./pages/Finance";

function Placeholder({ title, text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h3 className="text-xl font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </div>
  );
}

function App() {
  const { session, loading, profile } = useAuth();
  const [view, setView] = useState("kanban");

  useEffect(() => {
    if (profile?.rol !== "admin" && view !== "kanban") {
      setView("kanban");
    }
  }, [profile, view]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
          Cargando...
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Layout currentView={view} setCurrentView={setView}>
      {!profile && (
        <Placeholder
          title="Perfil no encontrado"
          text="La sesión existe, pero este usuario no tiene registro en profiles. Revisa la tabla profiles en Supabase."
        />
      )}

      {profile && view === "kanban" && <Kanban />}
      {profile && view === "create" && <CreateOrder />}
      {profile && view === "inventario" && <Inventory />}
      {profile && view === "finanzas" && <Finance/>}
      
    </Layout>
  );
}

export default App;