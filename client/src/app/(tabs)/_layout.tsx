import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View, type GestureResponderEvent } from 'react-native';

const ACTIVE_COLOR = '#4d5d3f'; // sage-700
const INACTIVE_COLOR = '#93aa7d'; // sage-400

export default function TabsLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACTIVE_COLOR,
          tabBarInactiveTintColor: INACTIVE_COLOR,
          tabBarStyle: { backgroundColor: '#fffdf9', borderTopColor: '#d3ddc5' },
          tabBarLabelStyle: { fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 11 },
        }}>
        <Tabs.Screen
          name="closet"
          options={{
            title: 'Closet',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="wardrobe-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="outfits"
          options={{
            title: 'Outfits',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="tshirt-crew-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="stylist"
          options={{
            title: 'Stylist',
            tabBarButton: ({ onPress }) => <StylistTabButton onPress={onPress} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}

// Raised circular button in the middle of the tab bar for the AI stylist chat.
function StylistTabButton({ onPress }: { onPress?: (e: GestureResponderEvent) => void }) {
  return (
    <View className="flex-1 items-center">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Stylist chat"
        className="-mt-5 h-14 w-14 items-center justify-center rounded-full border-4 border-cream-100 bg-sage-500">
        <MaterialCommunityIcons name="hanger" size={26} color="#fffdf9" />
      </Pressable>
    </View>
  );
}
