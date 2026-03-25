import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Checkout from "@/pages/Checkout";
import QrScreen from "@/pages/QrScreen";
import Seller from "@/pages/Seller";
import Admin from "@/pages/Admin";
import MyTickets from "@/pages/MyTickets";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/checkout/:bagId" component={Checkout} />
      <Route path="/qr/:token" component={QrScreen} />
      <Route path="/seller" component={Seller} />
      <Route path="/admin" component={Admin} />
      <Route path="/my-tickets" component={MyTickets} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
