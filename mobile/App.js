import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from './src/screens/LoginScreen';
import DriverMapScreen from './src/screens/DriverMapScreen';
import SupervisorScreen from './src/screens/SupervisorScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="DriverMap" component={DriverMapScreen} options={{ title: 'Minha Rota' }} />
          <Stack.Screen name="SupervisorDashboard" component={SupervisorScreen} options={{ title: 'Painel da Frota' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
