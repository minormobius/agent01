import { ProfileProvider } from "./state/profile";
import { useRoute } from "./router";
import Landing from "./routes/Landing";
import Networth from "./routes/Networth";
import Mort from "./routes/Mort";
import Cashflow from "./routes/Cashflow";
import Retire from "./routes/Retire";
import Timeline from "./routes/Timeline";

const ROUTES = {
  "/": Landing,
  "/networth": Networth,
  "/mort": Mort,
  "/cashflow": Cashflow,
  "/retire": Retire,
  "/timeline": Timeline,
};

export default function App() {
  const path = useRoute();
  const Page = ROUTES[path];

  return (
    <ProfileProvider>
      {Page ? <Page /> : <NotFound path={path} />}
    </ProfileProvider>
  );
}

function NotFound({ path }) {
  return (
    <div className="not-found">
      <h1>not found</h1>
      <p>
        <code>{path}</code> isn't a route here. <a href="/pm">return to home</a>
      </p>
    </div>
  );
}
