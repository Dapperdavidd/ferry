import { Redirect } from "expo-router";

export default function SocialRedirect() {
  return <Redirect href="/bills?section=shared" />;
}
