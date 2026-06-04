import React from 'react';
import { render } from '@testing-library/react-native';
import { SampleComponent } from './SampleComponent';

describe('SampleComponent', () => {
  it('renders correctly with given title', () => {
    const { getByTestId, getByText } = render(<SampleComponent title="Test Title" />);

    expect(getByTestId('sample-title')).toBeTruthy();
    expect(getByText('Test Title')).toBeTruthy();
  });
});
