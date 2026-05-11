import { ProfileProvider } from "./state/profile";
import { useRoute } from "./router";
import Landing from "./routes/Landing";
import Networth from "./routes/Networth";

const ROUTES = {
  "/": Landing,
  "/networth": Networth,
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
        <code>{path}</code> isn't a route here. <a href="/">return to home</a>
      </p>
    </div>
  );
}
