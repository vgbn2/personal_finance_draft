/*
 * Filename: C04018.c
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
    int t;
    scanf("%d", &t); // Read input
    while (t--)
    {
        int n;
        scanf("%d", &n); // Read input
        int a[31];
        for (int i = 0; i < n; i++)
            scanf("%d", &a[i]); // Read input
        int dem = 0;
        for (int i = 0; i < n - 1; i++)
            if (a[i] == a[i + 1])
                dem++;
        printf("%d\n", dem); // Print result
    }
}