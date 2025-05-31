import { Authenticated, Unauthenticated } from "convex/react";
import { SignInForm } from "./SignInForm";
import { Toaster } from "sonner";
import { Dashboard } from "./components/Dashboard";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Authenticated>
        <Dashboard />
      </Authenticated>

      <Unauthenticated>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full space-y-8 p-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Market Finder</h1>
              <p className="text-lg text-gray-600 mb-8">
                Discover arbitrage opportunities across prediction markets
              </p>
            </div>
            <SignInForm />
          </div>
        </div>
      </Unauthenticated>

      <Toaster />
    </div>
  );
}
