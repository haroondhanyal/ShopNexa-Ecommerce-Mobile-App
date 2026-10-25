import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';
const adminApi = axios.create({ baseURL: API_URL, timeout: 7000 });
const TOKEN_KEY = 'shopnexa.adminToken';
const money = (value = 0) => `Rs. ${Number(value).toLocaleString('en-PK')}`;
const sections = [
  ['Overview', 'grid-outline'], ['Store sales', 'trending-up-outline'], ['Users', 'people-outline'],
  ['Sellers', 'storefront-outline'], ['Products', 'pricetags-outline'], ['Orders', 'cube-outline'],
  ['Categories', 'list-outline'], ['Banners', 'images-outline'], ['Reseller earnings', 'cash-outline']
];
const endpoints = {
  Overview: '/admin/dashboard', 'Store sales': '/admin/stores/sales', Users: '/admin/users',
  Sellers: '/admin/sellers', Products: '/admin/products', Orders: '/admin/orders',
  Categories: '/admin/categories', Banners: '/admin/banners', 'Reseller earnings': '/admin/reseller-earnings'
};
const nextOrderStatus = { pending: 'accepted', accepted: 'ready_to_ship', ready_to_ship: 'shipped', shipped: 'delivered' };
const niceStatus = (status = '') => status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
const AdminThemeContext = createContext({ colors: { background: '#f5f7fc', surface: '#ffffff', surfaceAlt: '#eef3f9', text: '#172033', muted: '#788599', border: '#e5e9f0', statusBarStyle: 'dark' }, accent: '#2451c5' });

export default function AdminScreen({ navigation, appearanceColors, themeColor = '#2451c5' }) {
  const insets = useSafeAreaInsets();
  const colors = appearanceColors || { background: '#f5f7fc', surface: '#ffffff', surfaceAlt: '#eef3f9', text: '#172033', muted: '#788599', border: '#e5e9f0', statusBarStyle: 'dark' };
  const theme = { colors, accent: themeColor };
  const [token, setToken] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [mode, setMode] = useState('login');
  const [page, setPage] = useState('Overview');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [categoryName, setCategoryName] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((saved) => setToken(saved || '')).catch(() => setToken('')).finally(() => setRestoring(false));
  }, []);
  useEffect(() => {
    if (token) adminApi.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete adminApi.defaults.headers.common.Authorization;
  }, [token]);

  const load = useCallback(async (section = page) => {
    if (!token) return;
    setError('');
    try { const { data: response } = await adminApi.get(endpoints[section]); setData(response); }
    catch (e) {
      const message = e.response?.data?.message || 'Could not load the control room.';
      setError(message);
      if ([401, 403].includes(e.response?.status)) { await SecureStore.deleteItemAsync(TOKEN_KEY); setToken(''); }
    }
  }, [page, token]);
  useEffect(() => { if (token) load(page); }, [token, page, load]);

  const authenticate = async (eventType) => {
    setBusy(true); setError('');
    try {
      if (eventType === 'login') {
        const { data: response } = await adminApi.post('/auth/login', { email, password });
        if (response.user?.role !== 'admin') throw new Error('This account does not have admin access.');
        await SecureStore.setItemAsync(TOKEN_KEY, response.token); setToken(response.token);
      } else if (eventType === 'setup') {
        const { data: response } = await adminApi.post('/auth/admin/setup', { name, phone, email, password, setupSecret });
        await SecureStore.setItemAsync(TOKEN_KEY, response.token); setToken(response.token);
        Alert.alert('Admin account ready', 'The first administrator can now manage the marketplace from this mobile control room.');
      } else if (eventType === 'forgot') {
        const { data: response } = await adminApi.post('/auth/forgot-password', { email });
        setResetToken(response.resetToken || ''); setMode('reset');
        Alert.alert('Reset instructions', response.resetToken ? `Development reset code: ${response.resetToken}` : response.message);
      } else {
        const { data: response } = await adminApi.post('/auth/reset-password', { email, token: resetToken, password });
        setMode('login'); setPassword(''); setResetToken('');
        Alert.alert('Password updated', response.message || 'You can now sign in with your new password.');
      }
    } catch (e) {
      const message = e.response?.data?.message || e.message || 'Could not sign in.';
      setError(message); Alert.alert(eventType === 'setup' ? 'Admin setup failed' : 'Sign-in failed', message);
    } finally { setBusy(false); }
  };

  const runAction = async (title, detail, path, method = 'patch', payload = {}) => {
    Alert.alert(title, detail, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        setBusy(true);
        try { await adminApi[method](path, payload); await load(page); Alert.alert('Action complete', 'The control room has been updated.'); }
        catch (e) { Alert.alert('Action failed', e.response?.data?.message || 'The change could not be saved.'); }
        finally { setBusy(false); }
      } }
    ]);
  };

  const logout = async () => { await SecureStore.deleteItemAsync(TOKEN_KEY); delete adminApi.defaults.headers.common.Authorization; setToken(''); setData(null); };
  const addCategory = async () => {
    const value = categoryName.trim(); if (value.length < 2) { Alert.alert('Category name', 'Enter at least two characters.'); return; }
    setBusy(true);
    try { await adminApi.post('/admin/categories', { name: value }); setCategoryName(''); await load('Categories'); Alert.alert('Category added', `${value} is now in the marketplace.`); }
    catch (e) { Alert.alert('Could not add category', e.response?.data?.message || 'Try again.'); }
    finally { setBusy(false); }
  };

  if (restoring) return <AdminThemeContext.Provider value={theme}><View style={[styles.center, { backgroundColor: colors.background }]}><StatusBar style={colors.statusBarStyle} /><ActivityIndicator color={themeColor} /></View></AdminThemeContext.Provider>;
  if (!token) return <AdminThemeContext.Provider value={theme}><View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}><StatusBar style={colors.statusBarStyle} /><View style={styles.authHeader}><Pressable onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="arrow-back" size={21} color={colors.text} /></Pressable><View style={[styles.brandMark, { backgroundColor: themeColor }]}><Text style={styles.brandMarkText}>S</Text></View></View><ScrollView contentContainerStyle={[styles.authContent, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"><View style={[styles.authCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.eyebrow, { color: themeColor }]}>SHOPNEXA · MOBILE ERP</Text><Text style={[styles.title, { color: colors.text }]}>{mode === 'login' ? 'Admin sign in' : mode === 'setup' ? 'First admin setup' : mode === 'forgot' ? 'Admin password reset' : 'Choose a new password'}</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{mode === 'login' ? 'Sign in to manage sellers, catalog, orders, and marketplace operations.' : mode === 'setup' ? 'Create the initial admin with the one-time server setup key.' : mode === 'forgot' ? 'We will send a reset code to your admin email.' : 'Enter the reset code and your new password.'}</Text>{mode === 'setup' && <><Field label="Administrator name" value={name} onChangeText={setName} autoCapitalize="words" /><Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Field label="One-time setup key" value={setupSecret} onChangeText={setSetupSecret} secureTextEntry /></>}<Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />{mode === 'reset' && <Field label="Reset code" value={resetToken} onChangeText={setResetToken} autoCapitalize="none" />}{['login', 'setup', 'reset'].includes(mode) && <Field label={mode === 'reset' ? 'New password' : 'Password'} value={password} onChangeText={setPassword} secureTextEntry />}{mode === 'login' && <Pressable onPress={() => { setMode('forgot'); setError(''); }} style={{ alignSelf: 'flex-end', paddingTop: 12 }}><Text style={[styles.link, { color: themeColor }]}>Forgot password?</Text></Pressable>}<Text style={[styles.hint, { color: colors.muted }]}>{mode === 'setup' ? 'Use at least 12 characters. Setup requires ADMIN_SETUP_SECRET on the API.' : mode === 'login' ? 'Only accounts with the admin role can enter this workspace.' : mode === 'forgot' ? 'If SMTP is configured, the reset code arrives by email. In development, the code is shown after requesting it.' : 'Reset codes expire after 30 minutes. Passwords must be at least 8 characters.'}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={busy} onPress={() => authenticate(mode)} style={[styles.primary, { backgroundColor: themeColor }, busy && { opacity: 0.6 }]}><Text style={styles.primaryText}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : mode === 'setup' ? 'Create first admin' : mode === 'forgot' ? 'Send reset code' : 'Update password'}</Text></Pressable><Pressable onPress={() => { setMode(mode === 'login' ? 'setup' : 'login'); setError(''); }} style={styles.switch}><Text style={[styles.link, { color: themeColor }]}>{mode === 'login' ? 'First setup? Create initial admin' : 'Back to admin sign in'}</Text></Pressable></View></ScrollView></View></AdminThemeContext.Provider>;

  return <AdminThemeContext.Provider value={theme}><View style={[styles.screen, { backgroundColor: colors.background }]}><StatusBar style={colors.statusBarStyle} /><View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}><Pressable onPress={() => navigation.goBack()} style={[styles.headerIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="arrow-back" size={21} color={colors.text} /></Pressable><View style={{ flex: 1, marginLeft: 11 }}><Text style={[styles.headerTitle, { color: colors.text }]}>ShopNexa Admin</Text><Text style={[styles.headerCaption, { color: colors.muted }]}>Mobile control room</Text></View><Pressable onPress={logout} style={[styles.headerIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="log-out-outline" size={21} color={colors.text} /></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.sectionScroll, { backgroundColor: colors.background }]} contentContainerStyle={[styles.sectionTabs, { backgroundColor: colors.background }]}>{sections.map(([label, icon]) => <Pressable key={label} onPress={() => setPage(label)} style={[styles.sectionTab, { backgroundColor: colors.surface, borderColor: colors.border }, page === label && { backgroundColor: themeColor, borderColor: themeColor }]}><Ionicons name={icon} size={15} color={page === label ? '#fff' : colors.muted} /><Text style={[styles.sectionTabText, { color: page === label ? '#fff' : colors.muted }]}>{label}</Text></Pressable>)}</ScrollView>
    {error ? <Text style={[styles.errorBanner, { color: colors.text }]}>{error}</Text> : null}
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.content, { backgroundColor: colors.background }]} refreshControl={undefined}>
      {page === 'Overview' && <><Text style={[styles.pageTitle, { color: colors.text }]}>Marketplace overview</Text><View style={styles.metrics}>{[['Customers', data?.summary?.users], ['Stores', data?.summary?.approvedSellers], ['Products', data?.summary?.activeProducts], ['Orders', data?.summary?.orders], ['Delivered sales', money(data?.summary?.deliveredSales)]].map(([label, value]) => <View key={label} style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: colors.text }]}>{value ?? '—'}</Text></View>)}</View><Panel title="ERP control room"><Text style={[styles.body, { color: colors.muted }]}>Manage marketplace operations from this mobile workspace. Admin tools remain protected by the server admin role.</Text></Panel></>}
      {page === 'Store sales' && (data?.stores || []).map((item) => <Panel key={item._id} title={item.storeName}><Text style={[styles.body, { color: colors.muted }]}>{item.user?.name || item.user?.email} · {item.status}</Text><Text style={[styles.body, { color: colors.muted }]}>Products {item.productCount} · Orders {item.orders} · Units {item.unitsSold}</Text><Text style={[styles.strong, { color: colors.text }]}>{money(item.sales)} delivered</Text></Panel>)}
      {page === 'Users' && (data?.users || []).map((item) => <Panel key={item._id} title={item.name}><Text style={[styles.body, { color: colors.muted }]}>{item.email} · {item.phone}</Text><Text style={[styles.body, { color: colors.muted }]}>Role: {item.role} · Joined {new Date(item.createdAt).toLocaleDateString()}</Text></Panel>)}
      {page === 'Sellers' && (data?.sellers || []).map((item) => <Panel key={item._id} title={item.storeName}><Text style={[styles.body, { color: colors.muted }]}>{item.user?.name} · {item.user?.email}</Text><Text style={[styles.body, { color: colors.muted }]}>Application: {item.status}</Text>{item.status === 'pending' && <View style={styles.actions}><ActionButton label="Approve" onPress={() => runAction('Approve seller?', `Enable seller access for ${item.storeName}?`, `/admin/sellers/${item._id}/status`, 'patch', { status: 'approved' })} /><ActionButton label="Reject" secondary onPress={() => runAction('Reject seller?', `Reject ${item.storeName}'s application?`, `/admin/sellers/${item._id}/status`, 'patch', { status: 'rejected' })} /></View>}</Panel>)}
      {page === 'Products' && (data?.products || []).map((item) => <Panel key={item._id} title={item.name}><Text style={[styles.body, { color: colors.muted }]}>{item.category} · {money(item.price)} · Stock {item.stock}</Text><ActionButton label={item.active ? 'Hide product' : 'Show product'} secondary onPress={() => runAction(`${item.active ? 'Hide' : 'Show'} product?`, `${item.name} will be ${item.active ? 'hidden from' : 'visible in'} the marketplace.`, `/admin/products/${item._id}`, 'patch', { active: !item.active })} /></Panel>)}
      {page === 'Orders' && (data?.orders || []).map((item) => <Panel key={item._id} title={`Order #${String(item._id).slice(-8)}`}><Text style={[styles.body, { color: colors.muted }]}>{item.user?.name || item.user?.email} · {new Date(item.createdAt).toLocaleString()}</Text><Text style={[styles.body, { color: colors.muted }]}>{item.items.length} items · {money(item.total)} · {niceStatus(item.status)}</Text>{item.paymentStatus === 'pending_verification' && <><Text style={[styles.body, { color: colors.muted }]}>Payment reference: {item.paymentReference || 'Not provided'} · {niceStatus(item.paymentMethod)}</Text><View style={styles.actions}><ActionButton label="Verify payment" onPress={() => runAction('Verify payment?', `Confirm receipt of ${money(item.total)} for order #${String(item._id).slice(-8)}?`, `/admin/orders/${item._id}/payment`, 'patch', { status: 'paid' })} /><ActionButton label="Reject reference" secondary onPress={() => runAction('Reject payment reference?', 'The customer will be able to submit a corrected transfer reference.', `/admin/orders/${item._id}/payment`, 'patch', { status: 'unpaid' })} /></View></>}{nextOrderStatus[item.status] && <ActionButton label={`Mark ${niceStatus(nextOrderStatus[item.status])}`} onPress={() => runAction('Update order?', `Move this order to ${niceStatus(nextOrderStatus[item.status])}?`, `/admin/orders/${item._id}/status`, 'patch', { status: nextOrderStatus[item.status] })} />}</Panel>)}
      {page === 'Categories' && <><Panel title="Add category"><Field label="Category name" value={categoryName} onChangeText={setCategoryName} /><ActionButton label="Add category" onPress={addCategory} /></Panel>{(data?.categories || []).map((item) => <Panel key={item._id} title={item.name}><Text style={[styles.body, { color: colors.muted }]}>{item.active ? 'Active in marketplace' : 'Hidden'}</Text></Panel>)}</>}
      {page === 'Banners' && (data?.banners || []).map((item) => <Panel key={item._id} title={item.title}><Text style={[styles.body, { color: colors.muted }]}>{item.subtitle || item.category || 'ShopNexa campaign'}</Text><ActionButton label={item.active ? 'Hide banner' : 'Show banner'} secondary onPress={() => runAction(`${item.active ? 'Hide' : 'Show'} banner?`, `${item.title} will be ${item.active ? 'hidden' : 'shown'}.`, `/admin/banners/${item._id}`, 'patch', { active: !item.active })} /></Panel>)}
      {page === 'Reseller earnings' && (data?.earnings || []).map((item) => <Panel key={item._id} title={`${item.reseller?.name || 'Reseller'} · ${money(item.amount)}`}><Text style={[styles.body, { color: colors.muted }]}>Order #{String(item.order?._id || '').slice(-8)} · {niceStatus(item.status)}</Text>{item.status !== 'settled' && <ActionButton label="Settle earnings" disabled={item.order?.status !== 'delivered'} onPress={() => runAction('Settle reseller earnings?', `Settle ${money(item.amount)}?`, `/admin/reseller-earnings/${item._id}/settle`)} />}</Panel>)}
      {page !== 'Overview' && !(data?.[({ 'Store sales': 'stores', Users: 'users', Sellers: 'sellers', Products: 'products', Orders: 'orders', Categories: 'categories', Banners: 'banners', 'Reseller earnings': 'earnings' })[page]] || []).length && page !== 'Categories' && <Text style={[styles.empty, { color: colors.muted }]}>No records to show yet.</Text>}
      {busy && <ActivityIndicator style={{ marginVertical: 16 }} color="#2451c5" />}
    </ScrollView>
  </View></AdminThemeContext.Provider>;
}

function Field({ label, ...props }) { const { colors } = useContext(AdminThemeContext); return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text><TextInput placeholder={label} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.input || colors.surface, color: colors.text, borderColor: colors.border }]} {...props} /></View>; }
function Panel({ title, children }) { const { colors } = useContext(AdminThemeContext); return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>{children}</View>; }
function ActionButton({ label, onPress, secondary, disabled }) { const { colors, accent } = useContext(AdminThemeContext); return <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, { backgroundColor: secondary ? colors.surfaceAlt : accent }, disabled && { opacity: 0.45 }]}><Text style={[styles.actionText, { color: secondary ? colors.text : '#fff' }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fc' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f7fc' },
  header: { minHeight: 76, paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  authHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 14 }, backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2f7' },
  brandMark: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#2451c5', alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  authContent: { padding: 22, paddingTop: 32, paddingBottom: 50 }, authCard: { maxWidth: 520, width: '100%', alignSelf: 'center', borderRadius: 24, borderWidth: 1, padding: 22, shadowColor: '#13233a', shadowOpacity: 0.08, shadowRadius: 22, elevation: 3 }, eyebrow: { color: '#2451c5', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: '#172033', fontSize: 28, fontWeight: '900', marginTop: 8 }, subtitle: { color: '#788599', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 15 },
  field: { marginTop: 12 }, fieldLabel: { color: '#263347', fontSize: 12, fontWeight: '800', marginBottom: 7 }, input: { height: 49, borderRadius: 12, borderWidth: 1, borderColor: '#e2e7ef', backgroundColor: '#fff', paddingHorizontal: 13, color: '#172033' }, hint: { color: '#788599', fontSize: 11, lineHeight: 17, marginTop: 12 }, error: { color: '#ad3f4b', backgroundColor: '#fff0f1', borderRadius: 10, padding: 11, fontSize: 12, marginTop: 13 },
  primary: { height: 49, borderRadius: 13, backgroundColor: '#2451c5', alignItems: 'center', justifyContent: 'center', marginTop: 16 }, primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' }, switch: { alignItems: 'center', padding: 17 }, link: { color: '#2451c5', fontSize: 12, fontWeight: '800' },
  headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#f1f4f9', alignItems: 'center', justifyContent: 'center' }, headerTitle: { color: '#172033', fontSize: 17, fontWeight: '900' }, headerCaption: { color: '#8a96a7', fontSize: 10, marginTop: 2 },
  sectionScroll: { flexGrow: 0, maxHeight: 54 }, sectionTabs: { paddingHorizontal: 14, paddingVertical: 8, gap: 7 }, sectionTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e9f0' }, sectionTabActive: { backgroundColor: '#2451c5', borderColor: '#2451c5' }, sectionTabText: { color: '#526176', fontSize: 11, fontWeight: '700' }, sectionTabTextActive: { color: '#fff' },
  content: { padding: 17, paddingBottom: 36 }, pageTitle: { color: '#172033', fontSize: 21, fontWeight: '900', marginBottom: 14 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 6 }, metric: { width: '48%', minHeight: 88, backgroundColor: '#fff', borderRadius: 15, padding: 13, borderWidth: 1, borderColor: '#edf0f5' }, metricLabel: { color: '#788599', fontSize: 11, fontWeight: '600' }, metricValue: { color: '#172033', fontSize: 19, fontWeight: '900', marginTop: 8 },
  panel: { padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#edf0f5', marginBottom: 11 }, panelTitle: { color: '#172033', fontSize: 14, fontWeight: '800', marginBottom: 7 }, body: { color: '#637186', fontSize: 12, lineHeight: 18, marginTop: 3 }, strong: { color: '#172033', fontSize: 13, fontWeight: '900', marginTop: 7 }, actions: { flexDirection: 'row', gap: 9, marginTop: 8 }, actionButton: { minHeight: 40, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#2451c5', borderRadius: 11, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: 9 }, actionSecondary: { backgroundColor: '#eef2f8' }, actionText: { color: '#fff', fontSize: 11, fontWeight: '800' }, actionSecondaryText: { color: '#35445a' }, errorBanner: { color: '#a63e49', backgroundColor: '#fff0f1', marginHorizontal: 15, marginTop: 8, padding: 10, borderRadius: 10, fontSize: 12 }, empty: { textAlign: 'center', color: '#788599', padding: 32, fontSize: 13 }
});
