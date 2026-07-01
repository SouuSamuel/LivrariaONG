import 'react-native-gesture-handler';
import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/contexts/AuthContext";
import { Routes } from "./src/routes";

export default function App() {
  return (
    <>
      <AuthProvider>
        <Routes />
      </AuthProvider>
      <StatusBar style="auto" />
    </>
  );
}