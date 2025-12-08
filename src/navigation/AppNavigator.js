import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import AuthNavigator from './AuthNavigator';
import HomeScreen from '../screens/HomeScreen';

export default function AppNavigator() {
  const { isAuthenticated } = useSelector((state) => state.auth);

  return (
    <NavigationContainer>
      {isAuthenticated ? <HomeScreen /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
