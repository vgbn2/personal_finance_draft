/*
 * Filename: C04007.c
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
    int m, n;
    scanf("%d%d", &m, &n); // Read input
    int a[100], b[100];
    for (int i = 0; i < m; i++)
        scanf("%d", &a[i]); // Read input
    for (int i = 0; i < n; i++)
        scanf("%d", &b[i]); // Read input
    int k;
    scanf("%d", &k); // Read input
    for (int i = 0; i < m + n; i++)
    {
        if (i < k)
            printf("%d ", a[i]); // Print result
        else if (i >= k && i < k + n)
            printf("%d ", b[i - k]); // Print result
        else
            printf("%d ", a[i - n]); // Print result
    }
    return 0;
}