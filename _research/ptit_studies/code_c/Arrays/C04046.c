/*
 * Filename: C04046.c
 * Description: Sorts an array of elements using functions: swap, QuickSort, solve
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

typedef long long ll;

void swap(int *a, int *b)
{
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

ll min(ll a, ll b)
{
    if (a < b)
        return a;
    return b;
}

void QuickSort(ll a[], int l, int r)
{
    int i = l;
    int j = r;
    ll p = a[(l + r) / 2];
    while (i < j)
    {
        while (a[i] < p)
            i++;
        while (a[j] > p)
            j--;
        if (i <= j)
        {
            swap(&a[i], &a[j]);
            i++;
            j--;
        }
    }
    if (i < r)
        QuickSort(a, i, r);
    if (j > l)
        QuickSort(a, l, j);
}

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    ll a[n];
    for (int i = 0; i < n; i++)
        scanf("%lld", &a[i]); // Read input
    QuickSort(a, 0, n - 1);
    ll Minn = 2 * 1e9;
    for (int i = 0; i < n - 1; i++)
        Minn = min(Minn, abs(a[i] - a[i + 1]));
    int count = 0;
    for (int i = 0; i < n - 1; i++)
        if (abs(a[i] - a[i + 1]) == Minn)
            count++;
    printf("%lld %d\n", Minn, count); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}