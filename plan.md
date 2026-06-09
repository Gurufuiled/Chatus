1. **Analyze `ChatListRow.tsx` performance**
   - In `mobile/src/components/ChatListRow.tsx`, `useMemo` is used to calculate `lastMessageSenderId`, `lastMessageStatus`, and `dialogPreview`.
   - The inputs to this `useMemo` rely on reading the stringified state output of a `zustand` selector: `lastMessageSnapshotKey = messageStore(React.useCallback((state) => { ... return JSON.stringify(...) }, [...]))`.
   - The selector constructs a new object and stringifies it on *every* store update (even unrelated ones) to return a primitive value that zustand can compare.
   - Stringifying JSON is relatively expensive, especially in a list component like `ChatListRow` that is rendered many times.

2. **Implement `useShallow` from `zustand/react/shallow` (or `zustand/shallow` based on module resolution)**
   - Instead of stringifying the selector's return value to ensure equality, we can return the plain object and use `useShallow` so zustand performs a shallow equality check.
   - We will modify `mobile/src/components/ChatListRow.tsx` to:
     - Import `useShallow` from `'zustand/react/shallow'` (or fallback to `'zustand/shallow'`).
     - Change the selector in `messageStore` to return the plain object instead of `JSON.stringify()`.
     - Wrap the selector with `useShallow`.
     - Remove the `JSON.parse` block since the return value is already parsed.

3. **Verify the changes**
   - Run linter in the `mobile` directory.
   - Run type checks in the `mobile` directory.

4. **Complete pre commit steps**
   - Complete pre commit steps to ensure proper testing, verification, review, and reflection are done.

5. **Submit the PR**
   - Create a PR titled "⚡ Bolt: [performance improvement] - Optimize ChatListRow zustand selector with useShallow" with a detailed explanation of the impact.
