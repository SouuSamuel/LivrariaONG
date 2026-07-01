import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { ActivityIndicator, View, Text } from "react-native";
import { useAuth } from "../contexts/AuthContext";

import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import AcervoScreen from "../screens/AcervosScreen";
import HomeScreen from "../screens/HomeScreen";
import LivrosScreen from "../screens/livros/LivrosScreen";
import PessoasScreen from "../screens/pessoas/PessoasScreen";
import EmprestimosScreen from "../screens/emprestimos/EmprestimosScreen";
import RelatoriosScreen from "../screens/relatorios/RelatoriosScreen";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const TabRoutes = () => (
  <Tab.Navigator screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: "#1D9E75",
    tabBarInactiveTintColor: "#888",
    tabBarStyle: { borderTopWidth: 0.5, borderTopColor: "#e0e0e0", paddingBottom: 4 },
  }}>
    <Tab.Screen name="Início" component={HomeScreen}
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🏠</Text> }} />
    <Tab.Screen name="Livros" component={LivrosScreen}
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📚</Text> }} />
    <Tab.Screen name="Pessoas" component={PessoasScreen}
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>👤</Text> }} />
    <Tab.Screen name="Empréstimos" component={EmprestimosScreen}
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📋</Text> }} />
    <Tab.Screen name="Relatórios" component={RelatoriosScreen}
      options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📄</Text> }} />
  </Tab.Navigator>
);

export const Routes = () => {
  const { user, loading } = useAuth();

  if (loading) return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color="#1D9E75" />
    </View>
  );

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          // ADM logado — acesso total
          <Stack.Screen name="App" component={TabRoutes} />
        ) : (
          // Não logado — tela de boas vindas + acervo público
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Acervo" component={AcervoScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default Routes;