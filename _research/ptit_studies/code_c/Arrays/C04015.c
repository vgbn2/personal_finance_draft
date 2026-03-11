/*
 * Filename: C04015.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

void solve(int t)
{
    int n;
    scanf("%d", &n); // Read input
    int a[101], dd[100005] = {0};
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        dd[a[i]]++;
    }
    printf("Test %d:\n", t); // Print result
    for (int i = 0; i < n; i++)
        if (dd[a[i]] >= 1)
        {
            printf("%d xuat hien %d lan\n", a[i], dd[a[i]]); // Print result
            dd[a[i]] = 0;
        }
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    for (int t = 1; t <= T; t++)
        solve(t);
    return 0;
}