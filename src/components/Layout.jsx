import { useAuth } from "../context/AuthContext";

export default function Layout({ currentView, setCurrentView, children }) {
  const { profile, signOut } = useAuth();

  const isAdmin = profile?.rol === "admin";
  const isOperario = profile?.rol === "operario";
  const isLectura = profile?.rol === "lectura";

  const menuItems = [
    { key: "kanban", label: "Kanban", visible: true },
    { key: "create", label: "Crear orden", visible: isAdmin },
    { key: "finanzas", label: "Finanzas", visible: isAdmin },
    { key: "inventario", label: "Inventario", visible: isAdmin },
  ].filter((item) => item.visible);

  const getTitle = () => {
    switch (currentView) {
      case "kanban":
        return "Producción";
      case "create":
        return "Nueva orden";
      case "finanzas":
        return "Finanzas";
      case "inventario":
        return "Inventario";
      default:
        return "Sistema";
    }
  };

  const getRoleLabel = () => {
    if (isAdmin) return "Admin";
    if (isOperario) return "Operario";
    if (isLectura) return "Lectura";
    return "Usuario";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-slate-200 bg-white p-5">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Producción</h1>
            <p className="mt-1 text-sm text-slate-500">Panel operativo</p>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => {
              const active = currentView === item.key;

              return (
                <button
                  key={item.key}
                  onClick={() => setCurrentView(item.key)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl bg-slate-100 p-4">
            <p className="text-sm font-semibold text-slate-800">
              {profile?.nombre || "Usuario"}
            </p>
            <p className="mt-1 text-xs text-slate-500">{getRoleLabel()}</p>

            <button
              onClick={signOut}
              className="mt-4 w-full rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">{getTitle()}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Gestión centralizada de órdenes
                </p>
              </div>

              <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
                {getRoleLabel()}
              </div>
            </div>
          </header>

          <section className="p-8">{children}</section>
        </main>
      </div>
    </div>
  );
}