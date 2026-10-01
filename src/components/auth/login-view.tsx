"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@marsella.com");
  const [password, setPassword] = useState("demo1234");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  // Register fields
  const [nit, setNit] = useState("");
  const [razon, setRazon] = useState("");
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("Medellín");
  const [showRegister, setShowRegister] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const d = await r.json();
        if (!r.ok) {
          toast.error(d.error ?? "Error al iniciar sesión");
          return;
        }
        toast.success(`Bienvenido, ${d.usuario.nombre}`);
        onLogin();
      } else {
        const r = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa: { nit, razonSocial: razon, ciudad },
            usuario: { nombre, email, password },
          }),
        });
        const d = await r.json();
        if (!r.ok) {
          toast.error(d.error ?? "Error al registrar");
          return;
        }
        toast.success(`Empresa ${d.empresa.razonSocial} registrada`);
        onLogin();
      }
    } catch (err) {
      toast.error("Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setLoading(true);
    try {
      const r = await fetch("/api/auth/demo", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast.error("Error al iniciar demo");
        return;
      }
      toast.success(d.message ?? "Sesión demo iniciada");
      onLogin();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-neutral-950 dark:to-neutral-900">
      {/* Lado izquierdo — branding */}
      <div className="md:flex-1 flex flex-col justify-center p-8 md:p-16">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold">
              M
            </div>
            <div>
              <h1 className="text-2xl font-bold">Marsella ERP</h1>
              <p className="text-sm text-neutral-500">
                Software Contable Administrativo
              </p>
            </div>
          </div>
          <p className="text-lg text-neutral-700 dark:text-neutral-300 mb-6">
            Reingeniería moderna de SG Hermes para Colombia: facturación
            electrónica DIAN, inventarios multibodega, cartera CXC/CXP,
            contabilidad PUC y reportes — todo en un solo lugar.
          </p>
          <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Estructura UBL 2.1 + CUFE lista (mock inicial)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Plan Único de Cuentas (PUC) precargado
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              RBAC granular: admin, contador, cajero, vendedor, bodeguero
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Kardex valorizado con costo promedio ponderado
            </li>
          </ul>
        </div>
      </div>

      {/* Lado derecho — formulario */}
      <div className="md:flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-6 md:p-8">
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setMode("login")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                  mode === "login"
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                }`}
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => setMode("register")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                  mode === "register"
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                }`}
              >
                Registrar empresa
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "register" && (
                <>
                  <div>
                    <Label htmlFor="nit">NIT empresa</Label>
                    <Input
                      id="nit"
                      value={nit}
                      onChange={(e) => setNit(e.target.value)}
                      placeholder="900.123.456-7"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="razon">Razón social</Label>
                    <Input
                      id="razon"
                      value={razon}
                      onChange={(e) => setRazon(e.target.value)}
                      placeholder="Mi Empresa S.A.S."
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="ciudad">Ciudad</Label>
                    <Input
                      id="ciudad"
                      value={ciudad}
                      onChange={(e) => setCiudad(e.target.value)}
                      placeholder="Medellín"
                    />
                  </div>
                  <div>
                    <Label htmlFor="nombre">Tu nombre</Label>
                    <Input
                      id="nombre"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Johan Marsella"
                      required
                    />
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="pass">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="pass"
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Procesando..." : mode === "login" ? "Entrar" : "Crear empresa"}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
              <span className="text-xs text-neutral-400">o</span>
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDemo}
              disabled={loading}
            >
              <Building2 className="w-4 h-4 mr-2" />
              Entrar en modo demo
            </Button>
            <p className="text-xs text-neutral-500 mt-3 text-center">
              Demo: <code>demo@marsella.com</code> / <code>demo1234</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
