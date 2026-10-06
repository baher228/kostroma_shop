import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BUSINESS_CATEGORIES } from '../constants/dashboard';
import { BusinessCategory } from '../types/models';

type BusinessCategoryTabsProps = {
  active: BusinessCategory;
  onSelect: (category: BusinessCategory) => void;
};

export const BusinessCategoryTabs = ({ active, onSelect }: BusinessCategoryTabsProps) => (
  <View style={categoryTabStyles.row}>
    {BUSINESS_CATEGORIES.map((category) => {
      const isActive = active === category;
      return (
        <Pressable
          key={category}
          style={[categoryTabStyles.tab, isActive && categoryTabStyles.tabActive]}
          onPress={() => onSelect(category)}
        >
          <Text style={[categoryTabStyles.text, isActive && categoryTabStyles.textActive]}>{category}</Text>
        </Pressable>
      );
    })}
  </View>
);

export const categoryTabStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tab: {
    borderWidth: 1,
    borderColor: '#bccabf',
    borderRadius: 10,
    backgroundColor: '#f3f6f4',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tabActive: {
    backgroundColor: '#1f4f37',
    borderColor: '#1f4f37',
  },
  text: {
    color: '#2f4437',
    fontWeight: '800',
    fontSize: 12,
  },
  textActive: {
    color: '#ffffff',
  },
});
