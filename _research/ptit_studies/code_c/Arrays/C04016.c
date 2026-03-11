/*
 * Filename: C04016.c
 * Description: C Program using functions: ktnt, solve
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

int ktnt(int n)
{
    if (n <= 1)
        return 0;
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
            return 0;
    return 1;
}

void solve(int t)
{
    int n;
    scanf("%d", &n); // Read input
    int a[101], max = 0;
    int dd[100005] = {0};
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        if (a[i] > max)
            max = a[i];
        if (ktnt(a[i]) == 1)
            dd[a[i]]++;
    }
    printf("Test %d:\n", t); // Print result
    for (int i = 2; i <= max; i++)
        if (dd[i] >= 1)
            printf("%d xuat hien %d lan\n", i, dd[i]); // Print result
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