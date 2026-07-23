import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
import Svg, { Circle, Defs, Mask, Path, Rect as SvgRect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

const SIDE_INSET = 18;
const TOP_CHROME = 68;
const BOTTOM_CHROME = 230;
const MAX_HISTORY = 80;
const MIN_THICKNESS = 2;
const MAX_THICKNESS = 14;
const MAX_EXPORT_EDGE = 4096;

const COLORS = [
  '#FFFFFF',
  '#111111',
  '#FF3B30',
  '#FF9500',
  '#FFD60A',
  '#34C759',
  '#32ADE6',
  '#0A84FF',
  '#AF52DE',
  '#FF2D8D',
];
const STICKERS = ['❤️', '👍', '😂', '🔥', '😍', '🎉', '⭐', '✅', '❌', '✨'];

type Point = { x: number; y: number };
type DrawingTool = 'pen' | 'marker' | 'eraser';
type EditorSection = 'draw' | 'text' | 'sticker';
type DrawingStroke = {
  id: number;
  tool: DrawingTool;
  color: string;
  width: number;
  opacity: number;
  points: Point[];
};
type Rect = { x: number; y: number; w: number; h: number };
type PhotoOverlayItem = {
  id: number;
  kind: 'text' | 'sticker';
  value: string;
  color: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

type DrawingOverlayProps = {
  uri: string;
  onConfirm: (editedUri: string, size: { width: number; height: number }) => void;
  onCancel: () => void;
};

function getImageDisplayRect(
  imgW: number,
  imgH: number,
  bounds: Rect,
): Rect {
  const scale = Math.min(bounds.w / imgW, bounds.h / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    x: bounds.x + (bounds.w - w) / 2,
    y: bounds.y + (bounds.h - h) / 2,
    w,
    h,
  };
}

function pathFromPoints(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

function resolveStrokeStyle(tool: DrawingTool, thickness: number) {
  if (tool === 'marker') {
    return { width: thickness * 2.4, opacity: 0.38 };
  }
  if (tool === 'eraser') {
    return { width: Math.max(18, thickness * 3.2), opacity: 1 };
  }
  return { width: thickness, opacity: 1 };
}

const ThicknessSlider = React.memo(function ThicknessSlider({
  value,
  color,
  onChange,
}: {
  value: number;
  color: string;
  onChange: (value: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const updateFromEvent = useCallback(
    (event: GestureResponderEvent) => {
      const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth));
      onChange(MIN_THICKNESS + ratio * (MAX_THICKNESS - MIN_THICKNESS));
    },
    [onChange, trackWidth],
  );
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: updateFromEvent,
        onPanResponderMove: updateFromEvent,
      }),
    [updateFromEvent],
  );
  const ratio = (value - MIN_THICKNESS) / (MAX_THICKNESS - MIN_THICKNESS);

  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderPreview}>
        <View
          style={{
            width: Math.max(4, value * 1.25),
            height: Math.max(4, value * 1.25),
            borderRadius: 99,
            backgroundColor: color,
          }}
        />
      </View>
      <View
        style={styles.sliderTouchArea}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
        <View style={[styles.sliderThumb, { left: `${ratio * 100}%`, borderColor: color }]} />
      </View>
    </View>
  );
});

function readPinch(event: GestureResponderEvent) {
  const touches = (event.nativeEvent as unknown as {
    touches?: Array<{ pageX: number; pageY: number }>;
  }).touches;
  if (!touches || touches.length < 2) return null;
  const [first, second] = touches;
  const dx = second.pageX - first.pageX;
  const dy = second.pageY - first.pageY;
  return { distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

const TransformableOverlayItem = React.memo(function TransformableOverlayItem({
  item,
  selected,
  onSelect,
  onChange,
}: {
  item: PhotoOverlayItem;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: Partial<PhotoOverlayItem>) => void;
}) {
  const startRef = useRef<PhotoOverlayItem | null>(null);
  const pinchRef = useRef<{ distance: number; angle: number } | null>(null);
  const itemRef = useRef(item);
  const handlersRef = useRef({ onSelect, onChange });

  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  useEffect(() => {
    handlersRef.current = { onSelect, onChange };
  }, [onChange, onSelect]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          handlersRef.current.onSelect();
          // Keep the values from the beginning of this gesture. State updates
          // during a drag must not reset its origin or active responder.
          startRef.current = { ...itemRef.current };
          pinchRef.current = null;
        },
        onPanResponderMove: (event, gesture) => {
          const start = startRef.current;
          if (!start) return;
          const pinch = gesture.numberActiveTouches >= 2 ? readPinch(event) : null;
          if (pinch && pinch.distance > 0) {
            if (!pinchRef.current) {
              pinchRef.current = pinch;
              return;
            }
            const initial = pinchRef.current;
            handlersRef.current.onChange({
              scale: Math.max(0.35, Math.min(4, start.scale * (pinch.distance / initial.distance))),
              rotation: start.rotation + ((pinch.angle - initial.angle) * 180) / Math.PI,
            });
            return;
          }
          handlersRef.current.onChange({ x: start.x + gesture.dx, y: start.y + gesture.dy });
        },
        onPanResponderRelease: () => {
          startRef.current = null;
          pinchRef.current = null;
        },
        onPanResponderTerminate: () => {
          startRef.current = null;
          pinchRef.current = null;
        },
      }),
    [],
  );

  const textStyle = item.kind === 'sticker' ? styles.stickerItem : styles.textItem;
  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.overlayItem,
        selected && styles.overlayItemSelected,
        { left: item.x, top: item.y, transform: [{ scale: item.scale }, { rotate: `${item.rotation}deg` }] },
      ]}
    >
      <Text style={[textStyle, { color: item.color }]}>{item.value}</Text>
    </View>
  );
});

export const DrawingOverlay = React.memo(function DrawingOverlay({
  uri,
  onConfirm,
  onCancel,
}: DrawingOverlayProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const compositionRef = useRef<View | null>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const activeStrokeFrameRef = useRef<number | null>(null);
  const strokeIdRef = useRef(1);
  const overlayIdRef = useRef(1);
  const textInputRef = useRef<TextInput>(null);

  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [editorSection, setEditorSection] = useState<EditorSection>('draw');
  const [color, setColor] = useState('#FF3B30');
  const [thickness, setThickness] = useState(5);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<DrawingStroke | null>(null);
  const [overlayItems, setOverlayItems] = useState<PhotoOverlayItem[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<number | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [processing, setProcessing] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (editorSection !== 'text') return;
    const frame = requestAnimationFrame(() => textInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editorSection]);

  const imageRect = useMemo(() => {
    const bounds: Rect = {
      x: SIDE_INSET,
      y: insets.top + TOP_CHROME,
      w: Math.max(1, containerSize.w - SIDE_INSET * 2),
      h: Math.max(
        1,
        containerSize.h - insets.top - insets.bottom - TOP_CHROME - BOTTOM_CHROME,
      ),
    };
    if (!imageSize) return bounds;
    return getImageDisplayRect(imageSize.w, imageSize.h, bounds);
  }, [containerSize, imageSize, insets.bottom, insets.top]);

  const allStrokes = useMemo(
    () => (activeStroke ? [...strokes, activeStroke] : strokes),
    [activeStroke, strokes],
  );

  const scheduleActiveStrokeRender = useCallback(() => {
    if (activeStrokeFrameRef.current != null) return;
    activeStrokeFrameRef.current = requestAnimationFrame(() => {
      activeStrokeFrameRef.current = null;
      const current = activeStrokeRef.current;
      if (!current) return;
      // Touch events may arrive much faster than the screen can paint. Keep the
      // hot path mutable and publish one immutable snapshot per animation frame.
      setActiveStroke({ ...current, points: [...current.points] });
    });
  }, []);

  const cancelActiveStrokeRender = useCallback(() => {
    if (activeStrokeFrameRef.current == null) return;
    cancelAnimationFrame(activeStrokeFrameRef.current);
    activeStrokeFrameRef.current = null;
  }, []);

  useEffect(() => cancelActiveStrokeRender, [cancelActiveStrokeRender]);

  const finishStroke = useCallback(() => {
    const finished = activeStrokeRef.current;
    if (!finished) return;
    cancelActiveStrokeRender();
    setStrokes((current) => [...current, { ...finished, points: [...finished.points] }].slice(-MAX_HISTORY));
    activeStrokeRef.current = null;
    setActiveStroke(null);
  }, [cancelActiveStrokeRender]);

  const drawResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => editorSection === 'draw' && imageReady && !processing,
        onMoveShouldSetPanResponder: () => editorSection === 'draw' && imageReady && !processing,
        onPanResponderGrant: (event) => {
          const style = resolveStrokeStyle(tool, thickness);
          const stroke: DrawingStroke = {
            id: strokeIdRef.current++,
            tool,
            color,
            width: style.width,
            opacity: style.opacity,
            points: [{ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }],
          };
          activeStrokeRef.current = stroke;
          setActiveStroke(stroke);
          setRedoStack([]);
        },
        onPanResponderMove: (event, gesture: PanResponderGestureState) => {
          const current = activeStrokeRef.current;
          if (gesture.numberActiveTouches > 1) {
            cancelActiveStrokeRender();
            activeStrokeRef.current = null;
            setActiveStroke(null);
            return;
          }
          if (!current) return;
          const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
          const previous = current.points[current.points.length - 1];
          if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1.8) return;
          current.points.push(point);
          scheduleActiveStrokeRender();
        },
        onPanResponderRelease: finishStroke,
        onPanResponderTerminate: finishStroke,
      }),
    [
      cancelActiveStrokeRender,
      color,
      editorSection,
      finishStroke,
      imageReady,
      processing,
      scheduleActiveStrokeRender,
      thickness,
      tool,
    ],
  );

  const selectTool = useCallback((nextTool: DrawingTool) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setTool(nextTool);
  }, []);

  const updateOverlay = useCallback((id: number, next: Partial<PhotoOverlayItem>) => {
    setOverlayItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const addOverlay = useCallback((kind: PhotoOverlayItem['kind'], value: string) => {
    if (!value.trim()) return;
    const id = overlayIdRef.current++;
    const item: PhotoOverlayItem = {
      id,
      kind,
      value,
      color: kind === 'sticker' ? '#FFFFFF' : color,
      x: Math.max(8, imageRect.w / 2 - (kind === 'sticker' ? 30 : 72)),
      y: Math.max(8, imageRect.h / 2 - 24),
      scale: 1,
      rotation: 0,
    };
    setOverlayItems((current) => [...current, item]);
    setSelectedOverlayId(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [color, imageRect.h, imageRect.w]);

  const addText = useCallback(() => {
    addOverlay('text', textDraft.trim());
    setTextDraft('');
  }, [addOverlay, textDraft]);

  const deleteSelectedOverlay = useCallback(() => {
    if (selectedOverlayId == null) return;
    setOverlayItems((current) => current.filter((item) => item.id !== selectedOverlayId));
    setSelectedOverlayId(null);
    void Haptics.selectionAsync().catch(() => undefined);
  }, [selectedOverlayId]);

  const undo = useCallback(() => {
    setStrokes((current) => {
      const removed = current[current.length - 1];
      if (!removed) return current;
      void Haptics.selectionAsync().catch(() => undefined);
      setRedoStack((redo) => [...redo, removed]);
      return current.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((current) => {
      const restored = current[current.length - 1];
      if (!restored) return current;
      void Haptics.selectionAsync().catch(() => undefined);
      setStrokes((history) => [...history, restored].slice(-MAX_HISTORY));
      return current.slice(0, -1);
    });
  }, []);

  const confirm = useCallback(async () => {
    if (!compositionRef.current || !imageSize || !imageReady || processing) return;
    setProcessing(true);
    try {
      const exportScale = Math.min(1, MAX_EXPORT_EDGE / Math.max(imageSize.w, imageSize.h));
      const exportWidth = Math.max(1, Math.round(imageSize.w * exportScale));
      const exportHeight = Math.max(1, Math.round(imageSize.h * exportScale));
      const editedUri = await captureRef(compositionRef, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
        width: exportWidth,
        height: exportHeight,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onConfirm(editedUri, { width: exportWidth, height: exportHeight });
    } catch (error) {
      if (__DEV__) console.warn('[DrawingOverlay] capture failed:', error);
      Alert.alert('Не удалось сохранить рисунок', 'Попробуйте ещё раз.');
    } finally {
      setProcessing(false);
    }
  }, [imageReady, imageSize, onConfirm, processing]);

  return (
    <View
      style={styles.root}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setContainerSize({ w: width, h: height });
      }}
    >
      <View
        ref={compositionRef}
        collapsable={false}
        renderToHardwareTextureAndroid
        style={[
          styles.composition,
          {
            left: imageRect.x,
            top: imageRect.y,
            width: imageRect.w,
            height: imageRect.h,
          },
        ]}
      >
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          cachePolicy="memory-disk"
          onLoad={(event) => {
            if (event.source.width > 0 && event.source.height > 0) {
              setImageSize({ w: event.source.width, h: event.source.height });
              setImageReady(true);
            }
          }}
        />

        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            {allStrokes.map((stroke, index) => {
              if (stroke.tool === 'eraser') return null;
              const laterErasers = allStrokes.slice(index + 1).filter((item) => item.tool === 'eraser');
              if (laterErasers.length === 0) return null;
              return (
                <Mask key={`mask-${stroke.id}`} id={`drawing-mask-${stroke.id}`}>
                  <SvgRect x="0" y="0" width="100%" height="100%" fill="#FFFFFF" />
                  {laterErasers.map((eraser) => (
                    <Path
                      key={eraser.id}
                      d={pathFromPoints(eraser.points)}
                      fill="none"
                      stroke="#000000"
                      strokeWidth={eraser.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Mask>
              );
            })}
          </Defs>
          {allStrokes.map((stroke, index) => {
            if (stroke.tool === 'eraser') return null;
            const hasLaterEraser = allStrokes.slice(index + 1).some((item) => item.tool === 'eraser');
            return (
              <Path
                key={stroke.id}
                d={pathFromPoints(stroke.points)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeOpacity={stroke.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                mask={hasLaterEraser ? `url(#drawing-mask-${stroke.id})` : undefined}
              />
            );
          })}
          {activeStroke?.tool === 'eraser' && activeStroke.points.length > 0 ? (
            <Circle
              cx={activeStroke.points[activeStroke.points.length - 1].x}
              cy={activeStroke.points[activeStroke.points.length - 1].y}
              r={activeStroke.width / 2}
              fill="rgba(255,255,255,0.12)"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth={1.5}
            />
          ) : null}
        </Svg>

        {overlayItems.map((item) => (
          <TransformableOverlayItem
            key={item.id}
            item={item}
            selected={selectedOverlayId === item.id}
            onSelect={() => setSelectedOverlayId(item.id)}
            onChange={(next) => updateOverlay(item.id, next)}
          />
        ))}

        {editorSection === 'draw' ? (
          <View style={StyleSheet.absoluteFill} {...drawResponder.panHandlers} />
        ) : null}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Отменить рисование"
        >
          <Feather name="x" size={25} color="#FFFFFF" />
        </Pressable>

        <View style={styles.historyGroup}>
          <Pressable
            style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
            onPress={undo}
            disabled={strokes.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Отменить последнее действие"
          >
            <MaterialCommunityIcons
              name="undo"
              size={23}
              color={strokes.length > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.32)'}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
            onPress={redo}
            disabled={redoStack.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Вернуть действие"
          >
            <MaterialCommunityIcons
              name="redo"
              size={23}
              color={redoStack.length > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.32)'}
            />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.topButton,
            styles.confirmButton,
            { backgroundColor: colors.accent },
            pressed && styles.pressed,
          ]}
          onPress={() => void confirm()}
          disabled={!imageReady || processing}
          accessibilityRole="button"
          accessibilityLabel="Сохранить рисунок"
        >
          {processing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="check" size={23} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      <View
        style={[
          styles.bottomPanel,
          {
            bottom: keyboardHeight,
            paddingBottom: keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 8) + 8,
          },
        ]}
      >
        <View style={styles.modeRow}>
          {([
            ['draw', 'pencil', 'Рисовать'],
            ['text', 'format-text', 'Текст'],
            ['sticker', 'emoticon-outline', 'Стикер'],
          ] as const).map(([section, icon, label]) => {
            const selected = editorSection === section;
            return (
              <Pressable
                key={section}
                style={({ pressed }) => [styles.modeButton, selected && styles.modeButtonActive, pressed && styles.pressed]}
                onPress={() => {
                  if (section !== 'text') Keyboard.dismiss();
                  setEditorSection(section);
                  if (section === 'draw') setSelectedOverlayId(null);
                  void Haptics.selectionAsync().catch(() => undefined);
                }}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
              >
                <MaterialCommunityIcons name={icon} size={21} color={selected ? '#FFFFFF' : 'rgba(255,255,255,0.64)'} />
                <Text style={[styles.modeLabel, selected && styles.modeLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {editorSection === 'draw' ? (
          <>
        <View style={styles.toolRow}>
          {([
            ['pen', 'pencil', 'Карандаш'],
            ['marker', 'format-color-highlight', 'Маркер'],
            ['eraser', 'eraser', 'Ластик'],
          ] as const).map(([toolName, icon, label]) => {
            const selected = tool === toolName;
            return (
              <Pressable
                key={toolName}
                style={({ pressed }) => [
                  styles.toolButton,
                  selected && styles.toolButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => selectTool(toolName)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
              >
                <MaterialCommunityIcons
                  name={icon}
                  size={22}
                  color={selected ? '#FFFFFF' : 'rgba(255,255,255,0.68)'}
                />
                <Text style={[styles.toolLabel, selected && styles.toolLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ThicknessSlider
          value={thickness}
          color={tool === 'eraser' ? '#FFFFFF' : color}
          onChange={setThickness}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.palette}
        >
          {COLORS.map((swatch) => {
            const selected = color === swatch;
            return (
              <Pressable
                key={swatch}
                style={[styles.swatchWrap, selected && styles.swatchWrapActive]}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => undefined);
                  setColor(swatch);
                  if (tool === 'eraser') setTool('pen');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Выбрать цвет ${swatch}`}
                accessibilityState={{ selected }}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch },
                    swatch === '#FFFFFF' && styles.lightSwatch,
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
          </>
        ) : null}

        {editorSection === 'text' ? (
          <View style={styles.objectControls}>
            <View style={styles.textEntryRow}>
              <TextInput
                ref={textInputRef}
                value={textDraft}
                onChangeText={setTextDraft}
                placeholder="Введите текст"
                placeholderTextColor="rgba(255,255,255,0.42)"
                style={[styles.textEntry, { color }]}
                maxLength={160}
                returnKeyType="done"
                onSubmitEditing={addText}
              />
              <Pressable
                style={({ pressed }) => [styles.addButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}
                onPress={addText}
                accessibilityRole="button"
                accessibilityLabel="Добавить текст"
              >
                <Feather name="plus" size={23} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.palette}>
              {COLORS.map((swatch) => (
                <Pressable key={swatch} style={[styles.swatchWrap, color === swatch && styles.swatchWrapActive]} onPress={() => setColor(swatch)}>
                  <View style={[styles.swatch, { backgroundColor: swatch }, swatch === '#FFFFFF' && styles.lightSwatch]} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {editorSection === 'sticker' ? (
          <View style={styles.objectControls}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerPalette}>
              {STICKERS.map((sticker) => (
                <Pressable
                  key={sticker}
                  style={({ pressed }) => [styles.stickerButton, pressed && styles.pressed]}
                  onPress={() => addOverlay('sticker', sticker)}
                  accessibilityRole="button"
                  accessibilityLabel={`Добавить стикер ${sticker}`}
                >
                  <Text style={styles.stickerPickerText}>{sticker}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {selectedOverlayId != null && editorSection !== 'draw' ? (
          <Pressable style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]} onPress={deleteSelectedOverlay}>
            <Feather name="trash-2" size={16} color="#FF6B6B" />
            <Text style={styles.deleteLabel}>Удалить выбранное</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    backgroundColor: '#050608',
  },
  composition: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 140,
  },
  topButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  confirmButton: {
    borderColor: 'rgba(255,255,255,0.22)',
  },
  historyGroup: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 23,
    backgroundColor: 'rgba(18,22,28,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  historyButton: {
    width: 42,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 9,
    backgroundColor: 'rgba(14,18,24,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.16)',
    zIndex: 140,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  modeButton: {
    height: 38,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 13,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  modeLabel: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 13,
    fontWeight: '700',
  },
  modeLabelActive: {
    color: '#FFFFFF',
  },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  toolButton: {
    minWidth: 86,
    height: 42,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  toolButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  toolLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontWeight: '600',
  },
  toolLabelActive: {
    color: '#FFFFFF',
  },
  sliderRow: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  sliderPreview: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderTouchArea: {
    flex: 1,
    height: 34,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: '#1B2028',
    borderWidth: 3,
  },
  palette: {
    paddingHorizontal: 16,
    paddingVertical: 3,
    gap: 9,
  },
  objectControls: {
    minHeight: 84,
    justifyContent: 'center',
  },
  textEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  textEntry: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerPalette: {
    paddingHorizontal: 14,
    gap: 8,
  },
  stickerButton: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stickerPickerText: {
    fontSize: 30,
  },
  deleteButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 3,
  },
  deleteLabel: {
    color: '#FF8585',
    fontSize: 12,
    fontWeight: '700',
  },
  overlayItem: {
    position: 'absolute',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overlayItemSelected: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  stickerItem: {
    fontSize: 54,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 2 },
  },
  textItem: {
    fontSize: 28,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 2 },
  },
  swatchWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchWrapActive: {
    borderColor: '#FFFFFF',
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  lightSwatch: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.42)',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.95 }],
  },
});
