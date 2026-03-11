/*
 * Filename: C01030.c
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
#include <math.h>

// Entry point
int main()
{
	int T;
	scanf("%d", &T); // Read input
	while (T--)
	{
		int n;
		scanf("%d", &n); // Read input
		for (int i = 2; i <= sqrt(n); i++)
		{
			while (n % i == 0)
			{
				printf("%d ", i); // Print result
				n /= i;
			}
		}
		if (n > 1)
			printf("%d", n); // Print result
		printf("\n"); // Print result
	}
	return 0;
}