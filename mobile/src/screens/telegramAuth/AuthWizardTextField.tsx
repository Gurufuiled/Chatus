import React, { memo } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

/** Мемоизированный ввод: при ре-рендере wizard из TDLib/стора поле не перерисовывается без смены props. */
export const AuthWizardTextField = memo(TextInput) as React.MemoExoticComponent<
  typeof TextInput
>;

export type { TextInputProps as AuthWizardTextFieldProps };
