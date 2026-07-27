import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { subscribe, reset } from "./renderTracker";
import { PERF_HUD } from "./flags";

type Row = { label: string; count: number };

const TOP_N = 10;

export default function RenderHudOverlay() {
  if (!PERF_HUD) return null;

  const [rows, setRows] = useState<Row[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const unsub = subscribe((snap) => setRows(snap.slice(0, TOP_N)));
    return () => {
      unsub();
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        pos.setOffset({ x: offset.current.x, y: offset.current.y });
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pos.x, dy: pos.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: (_, g) => {
        offset.current.x += g.dx;
        offset.current.y += g.dy;
        pos.flattenOffset();
      },
    }),
  ).current;

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: pos.getTranslateTransform() },
      ]}
      {...panResponder.panHandlers}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        onLongPress={() => {
          reset();
          setRows([]);
        }}
        style={collapsed ? styles.badge : styles.panel}
      >
        {collapsed ? (
          <Text style={styles.badgeText}>{total}</Text>
        ) : (
          <>
            <Text style={styles.title}>renders · tap to hide · hold to reset</Text>
            {rows.length === 0 ? (
              <Text style={styles.empty}>waiting…</Text>
            ) : (
              rows.map((r) => (
                <View key={r.label} style={styles.row}>
                  <Text numberOfLines={1} style={styles.label}>
                    {r.label}
                  </Text>
                  <Text style={styles.count}>{r.count}</Text>
                </View>
              ))
            )}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    right: 8,
    zIndex: 99999,
    elevation: 99999,
  },
  panel: {
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 180,
    maxWidth: 240,
  },
  badge: {
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 36,
    alignItems: "center",
  },
  badgeText: {
    color: "#FF4D6D",
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    color: "#FF4D6D",
    fontSize: 9,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 1,
  },
  label: {
    color: "#fff",
    fontSize: 11,
    flex: 1,
    marginRight: 6,
  },
  count: {
    color: "#7CFF9F",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  empty: {
    color: "#888",
    fontSize: 11,
    fontStyle: "italic",
  },
});
