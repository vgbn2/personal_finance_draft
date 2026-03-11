/*
 * Filename: C04011.c
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
#include <stdbool.h>

bool solve(int a[55], int i)
{
    for (int j = i; j >= 0; j--)
        if (a[i] < a[j])
            return 0;
    return 1;
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
    {
        int n;
        scanf("%d", &n); // Read input
        int a[55];
        for (int i = 0; i < n; i++)
            scanf("%d", &a[i]); // Read input
        int dem = 0;
        for (int i = 0; i < n; i++)
            if (solve(a, i))
                dem++;
        printf("%d\n", dem); // Print result
    }
    return 0;
}