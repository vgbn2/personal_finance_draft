/*
 * Filename: C03060.c
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

// Entry point
int main()
{
    int n, k;
    scanf("%d %d", &n, &k); // Read input
    int d = 0;
    for (int i = 1; i <= n; i++)
    {
        if (i % 2 == 0)
        {
            int j = i;
            while (j % 2 == 0)
            {
                d++;
                j /= 2;
            }
        }
    }
    if (d >= k)
        printf("Yes"); // Print result
    else
        printf("No"); // Print result
    return 0;
}