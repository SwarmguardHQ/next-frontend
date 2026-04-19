"use client";

import dynamic from "next/dynamic";

// ssr: false is only allowed inside Client Components
const SplashScreen = dynamic(() => import("@/components/SplashScreen"), {
  ssr: false,
});

export default function SplashScreenClient() {
  return <SplashScreen />;
}
