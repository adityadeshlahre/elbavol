import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APITester } from "./APITester";
import "./index.css";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

export function App() {
  return (
    <div className="container relative z-10 mx-auto p-8 text-center">
      <div className="mb-8 flex items-center justify-center gap-8">
        <img
          src={logo}
          alt="Bun Logo"
          className="h-36 scale-120 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]"
        />
        <img
          src={reactLogo}
          alt="React Logo"
          className="h-36 p-6 transition-all duration-300 [animation:spin_20s_linear_infinite] hover:drop-shadow-[0_0_2em_#61dafbaa]"
        />
      </div>
      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="font-bold text-3xl">Bun + React</CardTitle>
          <CardDescription>
            Edit{" "}
            <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">
              src/App.tsx
            </code>{" "}
            and save to test HMR
          </CardDescription>
        </CardHeader>
        <CardContent>
          <APITester />
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
