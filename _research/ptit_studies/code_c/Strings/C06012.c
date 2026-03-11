/*
 * Filename: C06012.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <string.h>
#include <stdbool.h>

bool check(char s[500])
{
	int l = strlen(s);
	for (int i = 0; i <= l / 2; i++)
	{
		if (s[i] != '2' && s[i] != '3' && s[i] != '5' && s[i] != '7')
			return 0;
		if (s[i] != s[l - i - 1])
			return 0;
	}
	return 1;
}

// Entry point
int main()
{
	int t;
	scanf("%d", &t); // Read input
	while (t--)
	{
		char s[500];
		scanf("%s", s); // Read input
		if (check(s))
			printf("YES\n"); // Print result
		else
			printf("NO\n"); // Print result
	}
	return 0;
}