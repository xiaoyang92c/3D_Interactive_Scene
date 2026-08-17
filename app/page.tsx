import type { Metadata } from "next";
import { JinshaExperience } from "./JinshaExperience";

export const metadata: Metadata = {
  title: "羽见千年｜金沙沉浸式数字体验",
  description: "跟随曦羽飞越自然、文明与记忆，进入金沙文明的数字旅程。",
};

export default function Home() {
  return <JinshaExperience />;
}
